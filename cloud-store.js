(function (window) {
    'use strict';

    const TABLE = 'ambertodo_memos';
    const PAGE_SIZE = 500;
    const settings = window.AMBER_SUPABASE || {};
    const url = typeof settings.url === 'string' ? settings.url.trim() : '';
    const key = typeof settings.publishableKey === 'string' ? settings.publishableKey.trim() : '';
    const listeners = new Set();
    let client = null;

    function validPublicKey(value) {
        if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true;
        // Legacy anon JWTs are public. Never accept service_role/secret keys.
        try {
            const parts = value.split('.');
            if (parts.length !== 3) return false;
            const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const payload = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
            return payload.role === 'anon';
        } catch (_) {
            return false;
        }
    }

    function validProjectUrl(value) {
        try {
            const parsed = new URL(value);
            return parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.search && !parsed.hash && parsed.pathname === '/';
        } catch (_) {
            return false;
        }
    }

    const blankConfiguration = !url && !key;
    const configured = validProjectUrl(url) && validPublicKey(key);

    function getClient() {
        if (!configured) throw new Error('Supabase 프로젝트 URL과 공개 키 설정을 확인해 주세요. 비밀 키는 브라우저에서 사용할 수 없습니다.');
        if (!window.supabase || typeof window.supabase.createClient !== 'function') {
            throw new Error('클라우드 연결 도구를 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침해 주세요.');
        }
        if (!client) {
            client = window.supabase.createClient(url, key, {
                // Email-link login returns tokens in the URL hash. The implicit flow
                // works even when the mail app opens the link in a different browser
                // (PKCE would need the verifier stored by the browser that asked).
                auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' }
            });
            // Supabase holds an auth lock during this callback. Do not await SDK calls here.
            client.auth.onAuthStateChange((event, session) => {
                for (const callback of listeners) {
                    try {
                        callback(session?.user || null, event);
                    } catch (_) {
                        // One view subscriber must not break the authentication lifecycle.
                        console.error('로그인 상태 화면을 갱신하지 못했습니다.');
                    }
                }
            });
        }
        return client;
    }

    function authRequired() {
        return Object.assign(new Error('로그인 세션이 끝났습니다. 다시 로그인해 주세요.'), { code: 'AMBER_AUTH_REQUIRED' });
    }

    async function request(operation, message) {
        let result;
        try {
            result = await operation();
        } catch (_) {
            throw new Error(message);
        }
        const error = result?.error;
        if (error?.name === 'AuthSessionMissingError' || [
            'session_not_found', 'refresh_token_not_found', 'user_not_found', 'bad_jwt', 'PGRST301', 'PGRST303'
        ].includes(error?.code)) throw authRequired();
        if (!result || error) throw new Error(message);
        return result.data;
    }

    async function requireUser(expectedUserId) {
        const sdk = getClient();
        const data = await request(() => sdk.auth.getUser(), '로그인 상태를 확인하지 못했습니다. 다시 로그인해 주세요.');
        if (!data?.user?.id) throw authRequired();
        if (expectedUserId !== undefined && data.user.id !== expectedUserId) {
            throw Object.assign(new Error('로그인 계정이 변경되었습니다. 다시 로그인해 주세요.'), { code: 'AMBER_ACCOUNT_CHANGED' });
        }
        return data.user;
    }

    function validateId(id) {
        if (!Number.isSafeInteger(id) || id <= 0) throw new Error('메모 번호 형식이 올바르지 않습니다.');
    }

    function validateJson(value, ancestors = new Set()) {
        if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
        if (typeof value === 'number' && Number.isFinite(value)) return;
        if (!value || typeof value !== 'object' || ancestors.has(value)) throw new Error('메모 데이터 형식이 올바르지 않습니다.');
        if (!Array.isArray(value) && Object.prototype.toString.call(value) !== '[object Object]') throw new Error('메모 데이터 형식이 올바르지 않습니다.');
        ancestors.add(value);
        for (const item of Object.values(value)) validateJson(item, ancestors);
        ancestors.delete(value);
    }

    function copyTodo(todo) {
        if (!todo || typeof todo !== 'object' || Array.isArray(todo)) throw new Error('메모 데이터 형식이 올바르지 않습니다.');
        validateId(todo.id);
        validateJson(todo);
        // Preserve the legacy JSON exactly: no default dates, fields, or migration markers.
        return JSON.parse(JSON.stringify(todo));
    }

    function contentOf(row) {
        if (!row?.content) throw new Error('저장된 메모를 확인할 수 없습니다. 새로고침 후 다시 시도해 주세요.');
        const content = copyTodo(row.content);
        if (row.id !== undefined && Number(row.id) !== content.id) throw new Error('저장된 메모 번호가 일치하지 않습니다.');
        return content;
    }

    async function init() {
        if (blankConfiguration) return null;
        const sdk = getClient();
        const data = await request(() => sdk.auth.getSession(), '로그인 상태를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.');
        return data?.session ? requireUser() : null;
    }

    // Login failures must say *why*; one generic sentence hid every cause before.
    const SIGN_IN_MESSAGES = {
        invalid_credentials: '이메일 또는 비밀번호가 맞지 않습니다. 대소문자와 앞뒤 공백을 확인해 주세요.',
        email_not_confirmed: '이메일 인증이 아직 끝나지 않았습니다. 받은 메일함(스팸함 포함)의 확인 링크를 먼저 눌러 주세요.',
        user_banned: '이 계정은 현재 로그인이 막혀 있습니다. Supabase 관리 화면에서 계정 상태를 확인해 주세요.',
        over_request_rate_limit: '로그인 시도가 너무 많았습니다. 몇 분 뒤에 다시 시도해 주세요.',
        email_provider_disabled: '이메일 로그인이 꺼져 있습니다. Supabase 인증 설정을 확인해 주세요.'
    };

    async function signIn(email, password) {
        const sdk = getClient();
        if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) throw new Error('이메일과 비밀번호를 입력해 주세요.');
        let result;
        try {
            result = await sdk.auth.signInWithPassword({ email: email.trim(), password });
        } catch (_) {
            throw new Error('로그인 서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.');
        }
        const error = result?.error;
        if (error) {
            const code = error.code || '';
            const known = SIGN_IN_MESSAGES[code] || (error.status === 429 ? SIGN_IN_MESSAGES.over_request_rate_limit : '');
            // Unknown codes still show the code so the cause can be looked up.
            throw new Error(known || `로그인하지 못했습니다. (오류 코드: ${code || error.status || '알 수 없음'})`);
        }
        if (!result?.data?.user?.id) throw new Error('로그인 정보를 확인하지 못했습니다. 다시 시도해 주세요.');
        return result.data.user;
    }

    const LINK_MESSAGES = {
        otp_disabled: '등록된 계정의 이메일이 아닙니다. 가입은 막혀 있으니, 계정을 만든 이메일을 입력해 주세요.',
        signup_disabled: '등록된 계정의 이메일이 아닙니다. 가입은 막혀 있으니, 계정을 만든 이메일을 입력해 주세요.',
        over_email_send_rate_limit: '로그인 메일을 너무 자주 요청했습니다. 이미 받은 메일의 링크를 쓰거나, 잠시 뒤(최대 1시간) 다시 요청해 주세요.',
        over_request_rate_limit: '요청이 너무 많았습니다. 몇 분 뒤에 다시 시도해 주세요.',
        email_address_not_authorized: 'Supabase 기본 메일은 프로젝트 팀 멤버 주소로만 보낼 수 있습니다. 관리 화면의 팀 멤버 이메일을 입력해 주세요.',
        email_address_invalid: '이메일 주소 형식을 확인해 주세요.'
    };

    function redirectAddress() {
        const { protocol, origin, pathname } = window.location;
        if (protocol !== 'https:' && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return null;
        return origin + pathname;
    }

    async function sendLoginLink(email) {
        const sdk = getClient();
        if (typeof email !== 'string' || !email.trim()) throw new Error('이메일을 입력해 주세요.');
        const redirectTo = redirectAddress();
        if (!redirectTo) throw new Error('이메일 링크 로그인은 배포된 주소(https://…)에서 열었을 때만 쓸 수 있습니다. 이 화면에서는 비밀번호 로그인을 사용해 주세요.');
        let result;
        try {
            // Never create accounts from the login box: sign-up stays closed.
            result = await sdk.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false, emailRedirectTo: redirectTo } });
        } catch (_) {
            throw new Error('로그인 서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.');
        }
        const error = result?.error;
        if (error) {
            const code = error.code || '';
            const known = LINK_MESSAGES[code] || (error.status === 429 ? LINK_MESSAGES.over_email_send_rate_limit : '');
            throw new Error(known || `로그인 메일을 보내지 못했습니다. (오류 코드: ${code || error.status || '알 수 없음'})`);
        }
    }

    async function signOut() {
        const sdk = getClient();
        await request(() => sdk.auth.signOut({ scope: 'local' }), '로그아웃하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.');
    }

    function subscribe(callback) {
        if (typeof callback !== 'function') throw new TypeError('로그인 상태를 받을 함수를 지정해 주세요.');
        listeners.add(callback);
        return () => listeners.delete(callback);
    }

    async function list(expectedUserId) {
        const user = await requireUser(expectedUserId);
        const result = [];
        // Stable ordering and explicit pages avoid Supabase's default 1,000-row limit.
        for (let offset = 0; ; offset += PAGE_SIZE) {
            const rows = await request(() => client.from(TABLE)
                .select('id,content').eq('user_id', user.id)
                .order('id', { ascending: false }).range(offset, offset + PAGE_SIZE - 1),
            '클라우드 메모를 불러오지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.');
            if (!Array.isArray(rows)) throw new Error('클라우드 메모 응답을 확인하지 못했습니다.');
            result.push(...rows.map(contentOf));
            if (rows.length < PAGE_SIZE) return result;
        }
    }

    async function add(todo, expectedUserId) {
        const user = await requireUser(expectedUserId);
        const content = copyTodo(todo);
        const row = await request(() => client.from(TABLE)
            .insert({ user_id: user.id, id: content.id, content }).select('id,content').single(),
        '메모를 저장하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.');
        return contentOf(row);
    }

    async function setCompleted(id, completed, expectedUserId) {
        const user = await requireUser(expectedUserId);
        validateId(id);
        if (typeof completed !== 'boolean') throw new Error('메모 완료 상태가 올바르지 않습니다.');
        const existing = await request(() => client.from(TABLE).select('id,content')
            .eq('user_id', user.id).eq('id', id).single(), '변경할 메모를 찾지 못했습니다. 새로고침 후 다시 시도해 주세요.');
        if (!existing) throw new Error('변경할 메모를 찾지 못했습니다.');
        const content = contentOf(existing);
        content.completed = completed;
        // The completion day is what the date-by-date history shows. Undoing a
        // completion removes it so the item leaves that day's record.
        if (completed) content.completedAt = new Date().toISOString();
        else delete content.completedAt;
        const updated = await request(() => client.from(TABLE).update({ content })
            .eq('user_id', user.id).eq('id', id).select('id,content').single(),
        '완료 상태를 저장하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.');
        return contentOf(updated);
    }

    async function remove(id, expectedUserId) {
        const user = await requireUser(expectedUserId);
        validateId(id);
        const deleted = await request(() => client.from(TABLE).delete()
            .eq('user_id', user.id).eq('id', id).select('id'),
        '메모를 삭제하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.');
        if (!Array.isArray(deleted) || deleted.length !== 1 || Number(deleted[0].id) !== id) throw new Error('삭제할 메모를 찾지 못했습니다. 새로고침 후 다시 시도해 주세요.');
    }

    async function importLegacy(todos, expectedUserId) {
        const user = await requireUser(expectedUserId);
        if (!Array.isArray(todos)) throw new Error('이전 메모 데이터 형식이 올바르지 않습니다.');
        // Validate every item before the first write. A retry skips rows already saved.
        const rows = todos.map(todo => {
            const content = copyTodo(todo);
            return { user_id: user.id, id: content.id, content };
        });
        for (let offset = 0; offset < rows.length; offset += PAGE_SIZE) {
            await request(() => client.from(TABLE).upsert(rows.slice(offset, offset + PAGE_SIZE), {
                onConflict: 'user_id,id', ignoreDuplicates: true
            }), '이전 메모를 모두 가져오지 못했습니다. 다시 시도하면 이미 저장된 메모는 그대로 유지됩니다.');
        }
    }

    window.AmberCloud = Object.freeze({ configured, init, signIn, sendLoginLink, signOut, subscribe, list, add, setCompleted, remove, importLegacy });
})(window);
