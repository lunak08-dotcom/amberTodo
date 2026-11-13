// Account UI owns loading/error states. Memo contents are never cached here.
window.createAmberAccount = function (hooks) {
    const store = window.AmberCloud;
    const form = document.getElementById('loginForm');
    const email = document.getElementById('loginEmail');
    const password = document.getElementById('loginPassword');
    const login = document.getElementById('loginButton');
    const linkButton = document.getElementById('linkButton');
    const logout = document.getElementById('logoutButton');
    const identity = document.getElementById('accountIdentity');
    const status = document.getElementById('accountStatus');
    const retry = document.getElementById('retryLoad');
    const legacySection = document.getElementById('legacyImport');
    const importButton = document.getElementById('importLegacyButton');
    let user = null;
    let ready = false;
    let loading = false;
    let authBusy = false;
    let writeBusy = false;
    let generation = 0;

    function message(text, error = false) {
        status.textContent = text;
        status.classList.toggle('is-error', error);
    }

    function migrationKey(userId) {
        return `ambertodo-imported:${window.AMBER_SUPABASE.url}:${userId}`;
    }

    function syncRoute() {
        const hash = user ? '#/memos' : '#/login';
        if (window.location.hash !== hash) window.history.replaceState(null, '', hash);
    }

    function legacyTodos() {
        const value = JSON.parse(localStorage.getItem('todos') || '[]');
        if (!Array.isArray(value)) throw new Error('기존 브라우저 메모 형식을 확인할 수 없습니다. 원본은 보존되어 있습니다.');
        return value;
    }

    function render() {
        const busy = loading || authBusy || writeBusy;
        form.hidden = !store.configured || Boolean(user);
        login.disabled = busy;
        linkButton.disabled = busy;
        email.disabled = busy;
        password.disabled = busy;
        logout.hidden = !user;
        logout.disabled = authBusy || writeBusy;
        identity.hidden = !user;
        identity.textContent = user ? `${user.email || '내 계정'} · 비공개 메모` : '';
        retry.hidden = !user || ready || loading || authBusy;
        hooks.setWritable(ready && !busy);
        document.querySelectorAll('.private-content').forEach(element => {
            element.hidden = !ready;
        });
        legacySection.hidden = true;
        if (ready) {
            try {
                const count = legacyTodos().length;
                if (count && localStorage.getItem(migrationKey(user.id)) !== 'done') {
                    legacySection.hidden = false;
                    importButton.textContent = `기존 메모 ${count}개 가져오기`;
                    importButton.disabled = busy;
                }
            } catch {
                // Never replace malformed legacy data with an empty list.
                legacySection.hidden = false;
                importButton.textContent = '기존 메모 확인하기';
                importButton.disabled = busy;
            }
        }
    }

    function clearView(nextUser, willLoad) {
        const request = ++generation;
        user = nextUser;
        ready = false;
        loading = willLoad;
        writeBusy = false;
        hooks.applyTodos([]);
        hooks.clearDraft();
        render();
        syncRoute();
        return request;
    }

    function acceptUser(nextUser, { force = false, deferLoad = false } = {}) {
        if (!force && nextUser?.id === user?.id && (ready || loading || authBusy)) return;
        const request = clearView(nextUser, Boolean(nextUser));
        if (!user) {
            message('로그인하면 나만 볼 수 있는 메모를 불러옵니다.');
            return;
        }
        message('내 메모를 불러오는 중입니다…');
        if (deferLoad) {
            // Leave the SDK auth callback before starting another SDK request.
            setTimeout(() => loadMemos(nextUser.id, request), 0);
            return;
        }
        return loadMemos(nextUser.id, request);
    }

    function showOperationError(error, fallback) {
        if (error.code === 'AMBER_AUTH_REQUIRED' || error.code === 'AMBER_ACCOUNT_CHANGED') {
            acceptUser(null, { force: true });
        }
        message(error.message || fallback, true);
    }

    async function loadMemos(userId, request) {
        if (request !== generation) return;
        try {
            const todos = await store.list(userId);
            if (request !== generation) return;
            hooks.applyTodos(todos);
            ready = true;
            message('Supabase에 비공개로 저장됩니다.');
        } catch (error) {
            if (request === generation) showOperationError(error, '메모를 불러오지 못했습니다. 다시 시도해 주세요.');
        } finally {
            if (request === generation) {
                loading = false;
                render();
            }
        }
    }

    async function mutate(operation, successMessage) {
        if (!user || !ready || loading || authBusy || writeBusy) return false;
        const request = generation;
        const userId = user.id;
        writeBusy = true;
        render();
        message('저장 중입니다…');
        try {
            const commit = await operation(userId);
            if (request !== generation) return false;
            if (typeof commit === 'function') commit();
            message(successMessage);
            return true;
        } catch (error) {
            if (request === generation) showOperationError(error, '저장하지 못했습니다. 내용을 유지했으니 다시 시도해 주세요.');
            return false;
        } finally {
            if (request === generation) {
                writeBusy = false;
                render();
            }
        }
    }

    async function start() {
        hooks.applyTodos([]);
        render();
        window.addEventListener('hashchange', syncRoute);
        if (!store.configured) {
            syncRoute();
            message('Supabase 연결 준비 중입니다. 프로젝트 연결이 끝나면 이곳에서 로그인할 수 있어요. 기존 브라우저 메모는 그대로 보관되어 있습니다.');
            return;
        }
        // Main action: email a one-time login link (no password to remember on a phone).
        form.addEventListener('submit', async event => {
            event.preventDefault();
            if (user || authBusy || loading) return;
            authBusy = true;
            render();
            message('로그인 메일을 보내는 중입니다…');
            try {
                await store.sendLoginLink(email.value.trim());
                message(`${email.value.trim()} 으로 로그인 링크를 보냈습니다. 메일의 링크를 누르면 이 앱이 열리며 로그인됩니다. (스팸함도 확인해 주세요)`);
            } catch (error) {
                message(error.message || '로그인 메일을 보내지 못했습니다.', true);
            } finally {
                authBusy = false;
                render();
            }
        });
        // Backup action: password login, kept for PCs and for when mail is slow.
        login.addEventListener('click', async () => {
            if (user || authBusy || loading) return;
            const request = generation;
            authBusy = true;
            render();
            message('로그인 중입니다…');
            try {
                const signedInUser = await store.signIn(email.value.trim(), password.value);
                password.value = '';
                if (request === generation) acceptUser(signedInUser, { deferLoad: true });
            } catch (error) {
                if (request === generation) message(error.message || '로그인하지 못했습니다. 이메일과 비밀번호를 확인해 주세요.', true);
            } finally {
                authBusy = false;
                render();
            }
        });
        logout.addEventListener('click', async () => {
            if (!user || authBusy || writeBusy) return;
            authBusy = true;
            const request = clearView(user, false);
            message('로그아웃 중입니다…');
            try {
                await store.signOut();
                if (request === generation) acceptUser(null, { force: true });
                if (!user) message('로그아웃했습니다. 메모는 내 계정에 보관되어 있습니다.');
            } catch (error) {
                if (!user) message('이 브라우저에서 로그아웃했습니다. 서버의 로그아웃 처리는 확인하지 못했습니다.', true);
                else if (request === generation) showOperationError(error, '로그아웃하지 못했습니다. 다시 시도해 주세요.');
            } finally {
                authBusy = false;
                render();
            }
        });
        retry.addEventListener('click', () => acceptUser(user, { force: true }));
        importButton.addEventListener('click', () => mutate(async userId => {
            const legacy = legacyTodos();
            const key = migrationKey(userId);
            await store.importLegacy(legacy, userId);
            const imported = await store.list(userId);
            return () => {
                hooks.applyTodos(imported);
                localStorage.setItem(key, 'done');
            };
        }, '기존 메모를 가져왔습니다. 브라우저에 있던 원본도 보관했습니다.'));
        // Subscribe before checking storage or starting a memo read. A newer
        // auth event supersedes any result from the initial session check.
        store.subscribe((nextUser, event) => {
            if (event === 'INITIAL_SESSION') return;
            acceptUser(nextUser, { deferLoad: true, force: !nextUser });
        });
        const request = generation;
        authBusy = true;
        render();
        let restoredUser;
        try {
            restoredUser = await store.init();
        } catch (error) {
            if (request === generation) {
                acceptUser(null, { force: true });
                message(error.message || '로그인 상태를 확인하지 못했습니다. 다시 로그인해 주세요.', true);
            }
        } finally {
            authBusy = false;
            render();
        }
        if (request === generation) await acceptUser(restoredUser, { force: true });
    }

    return { start, mutate };
};
