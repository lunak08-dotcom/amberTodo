document.addEventListener('DOMContentLoaded', () => {
    // ==========================================================================
    // State & Constants
    // ==========================================================================
    let todos = [];
    let currentFilter = 'all';
    let searchQuery = '';
    let sortMethod = 'newest';
    let selectedMonth = 'all';
    let canWrite = false;
    let account;

    const priorityWeight = {
        'p1': 4, // 긴급 (Red)
        'p2': 3, // 높음 (Claude Amber)
        'p3': 2, // 보통 (Blue)
        'p4': 1  // 낮음 (Gray)
    };

    const priorityLabels = {
        'p1': 'P1 긴급',
        'p2': 'P2 높음',
        'p3': 'P3 보통',
        'p4': 'P4 낮음'
    };

    // Three kinds of entries share one table. Old memos without `kind` are to-dos.
    const KINDS = {
        todo: { label: '할 일', icon: 'check-square', title: '무엇을 해야 하나요?', desc: '메모 및 상세 내용을 추가해 보세요... (선택 사항)' },
        lesson: { label: '수업 후기', icon: 'graduation-cap', title: '학교·수업명 (예: 명호중 재난구조 2차시)', desc: '' },
        note: { label: '기록', icon: 'notebook-pen', title: '무엇을 기록할까요?', desc: '내용을 적어 보세요... (선택 사항)' }
    };
    // Same three lines the Obsidian wiki uses to turn a class into lessons learned.
    const LESSON_TEMPLATE = '잘 된 것: \n막힌 지점(몇 분, 몇 팀): \n다음에 바꿀 것 한 가지: ';
    const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

    // DOM Elements
    const todoForm = document.getElementById('todoForm');
    const todoTitleInput = document.getElementById('todoTitle');
    const todoDescInput = document.getElementById('todoDesc');
    const todoGrid = document.getElementById('todoGrid');
    const emptyState = document.getElementById('emptyState');
    const searchInput = document.getElementById('searchInput');
    const sortSelect = document.getElementById('sortSelect');
    const monthSelect = document.getElementById('monthSelect');
    const previousMonthButton = document.getElementById('previousMonth');
    const nextMonthButton = document.getElementById('nextMonth');
    const currentMonthButton = document.getElementById('currentMonth');
    const historySummary = document.getElementById('historySummary');
    const themeToggle = document.getElementById('themeToggle');
    const greetingText = document.getElementById('greetingText');
    const currentDateElement = document.getElementById('currentDate');

    // Sidebar & Navigation Elements
    const sidebarNavItems = document.querySelectorAll('.nav-item');
    const appSidebar = document.getElementById('appSidebar');
    const menuToggle = document.getElementById('menuToggle');

    // Stats & Karma Elements
    const countAll = document.getElementById('countAll');
    const countActive = document.getElementById('countActive');
    const countCompleted = document.getElementById('countCompleted');
    const countTimeline = document.getElementById('countTimeline');
    const countLesson = document.getElementById('countLesson');
    const countNote = document.getElementById('countNote');
    const prioritySelector = document.getElementById('prioritySelector');
    const exportButton = document.getElementById('exportMarkdown');
    const karmaPercent = document.getElementById('karmaPercent');
    const karmaProgressBar = document.getElementById('karmaProgressBar');
    const karmaStatusText = document.getElementById('karmaStatusText');

    // ==========================================================================
    // Initialization & Setup
    // ==========================================================================
    function init() {
        // Load Theme
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);

        // Set Current Date & Greeting
        updateDateTime();
        setInterval(updateDateTime, 60000); // 1분마다 업데이트

        // Event Listeners Registration
        registerEvents();
        applyKindToForm();

        // Initial Render
        renderTodos();
        updateStatistics();
        account = window.createAmberAccount({
            applyTodos(records) {
                todos = records;
                updateStatistics();
                renderTodos();
            },
            setWritable(value) {
                canWrite = value;
                updateWriteControls();
            },
            clearDraft() {
                todoTitleInput.value = '';
                todoDescInput.value = '';
                searchInput.value = '';
                searchQuery = '';
                currentFilter = 'all';
                selectedMonth = 'all';
                sidebarNavItems.forEach(item => item.classList.toggle('active', item.dataset.filter === 'all'));
                document.getElementById('kindTodo').checked = true;
                applyKindToForm();
                renderTodos();
            }
        });
        account.start();
    }

    // ==========================================================================
    // Date & Time Helpers
    // ==========================================================================
    function getCreatedDate(todo) {
        // Missing dates must stay undated; Date(null) would otherwise become 1970.
        if (typeof todo.createdAt !== 'string' || !todo.createdAt.trim()) return null;
        const date = new Date(todo.createdAt);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function kindOf(todo) {
        return Object.hasOwn(KINDS, todo.kind) ? todo.kind : 'todo';
    }

    function parseDate(value) {
        if (typeof value !== 'string' || !value.trim()) return null;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    // The day an entry belongs to in the date-by-date history:
    // a to-do counts on the day it was finished, a review or note on the day it was written.
    // Unfinished to-dos have no history day yet.
    function getActivityDate(todo) {
        if (kindOf(todo) === 'todo') {
            if (!todo.completed) return null;
            return parseDate(todo.completedAt) || getCreatedDate(todo);
        }
        return getCreatedDate(todo);
    }

    function getDayKey(date) {
        return `${getMonthKey(date)}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function formatDay(date) {
        return `${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAYS[date.getDay()]})`;
    }

    function formatFullDate(date) {
        return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
    }

    // Which date decides the month filter depends on the view.
    function getViewDate(todo) {
        return currentFilter === 'timeline' ? getActivityDate(todo) : getCreatedDate(todo);
    }

    function getMonthKey(date) {
        // Use the same local calendar as the date printed on each memo card.
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    function formatMonth(month) {
        if (month === 'all') return '전체 기간';
        const [year, monthNumber] = month.split('-').map(Number);
        return `${year}년 ${monthNumber}월`;
    }

    function renderMonthHistory(resultCount) {
        const months = new Set([getMonthKey(new Date())]);
        todos.forEach(todo => {
            const createdDate = getCreatedDate(todo);
            if (createdDate) months.add(getMonthKey(createdDate));
            const activityDate = getActivityDate(todo);
            if (activityDate) months.add(getMonthKey(activityDate));
        });
        // Keep a selected empty month available after navigation or deletion.
        if (selectedMonth !== 'all') months.add(selectedMonth);

        const options = [new Option('전체 기간', 'all')];
        [...months].sort().reverse().forEach(month => {
            options.push(new Option(formatMonth(month), month));
        });
        monthSelect.replaceChildren(...options);
        monthSelect.value = selectedMonth;
        previousMonthButton.disabled = selectedMonth === 'all';
        nextMonthButton.disabled = selectedMonth === 'all';
        historySummary.textContent = `${formatMonth(selectedMonth)} · ${resultCount}개`;
    }

    function moveMonth(direction) {
        if (selectedMonth === 'all') return;
        const [year, month] = selectedMonth.split('-').map(Number);
        // First of the month avoids Jan 31 -> March overflow when moving months.
        const date = new Date();
        date.setFullYear(year, month - 1 + direction, 1);
        selectedMonth = getMonthKey(date);
        renderTodos();
    }

    function updateDateTime() {
        const now = new Date();
        
        // Greeting Text depending on the hour
        const hour = now.getHours();
        let greeting = '안녕하세요! 오늘 할 일은 무엇인가요?';
        if (hour >= 5 && hour < 12) {
            greeting = '☀️ 좋은 아침입니다! 오늘 할 일은 무엇인가요?';
        } else if (hour >= 12 && hour < 18) {
            greeting = '☕ 즐거운 오후입니다! 기운 내서 채워볼까요?';
        } else {
            greeting = '🌙 편안한 저녁입니다. 오늘을 잘 마무리해봐요!';
        }
        greetingText.textContent = greeting;

        // Current Date display
        const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
        currentDateElement.textContent = now.toLocaleDateString('ko-KR', options);
    }

    // ==========================================================================
    // State Mutations & Saving
    // ==========================================================================
    function updateWriteControls() {
        document.querySelectorAll('#todoForm input, #todoForm textarea, #todoForm button, .custom-checkbox, .delete-btn')
            .forEach(element => { element.disabled = !canWrite; });
    }

    // ==========================================================================
    // Render Functions
    // ==========================================================================
    function renderTodos() {
        const filtered = getFilteredAndSortedTodos();
        renderMonthHistory(filtered.length);
        
        // Clear Grid
        todoGrid.innerHTML = '';
        todoGrid.classList.toggle('timeline-view', currentFilter === 'timeline');

        const emptyByFilter = {
            timeline: ['아직 날짜별 기록이 없습니다.', '할 일을 완료하거나 수업 후기·기록을 남기면 그날 날짜에 쌓입니다.'],
            lesson: ['수업 후기가 없습니다.', '수업이 끝나면 위에서 "수업 후기"를 골라 세 줄만 남겨 보세요.'],
            note: ['기록이 없습니다.', '위에서 "기록"을 골라 짧게 남겨 보세요.']
        };

        if (filtered.length === 0 && Object.hasOwn(emptyByFilter, currentFilter) && !searchQuery.trim()) {
            todoGrid.style.display = 'none';
            emptyState.style.display = 'flex';
            const [title, text] = emptyByFilter[currentFilter];
            emptyState.querySelector('h3').textContent = selectedMonth === 'all' ? title : `${formatMonth(selectedMonth)}: ${title}`;
            emptyState.querySelector('p').textContent = text;
        } else if (filtered.length === 0) {
            todoGrid.style.display = 'none';
            emptyState.style.display = 'flex';
            
            // Adjust empty state text depending on active filter/search
            const emptyTitle = emptyState.querySelector('h3');
            const emptyText = emptyState.querySelector('p');
            if (selectedMonth !== 'all') {
                const period = formatMonth(selectedMonth);
                if (searchQuery.trim()) {
                    emptyTitle.textContent = `${period}의 검색 결과가 없습니다.`;
                    emptyText.textContent = '검색어나 상태를 바꾸거나 다른 달을 선택해 보세요.';
                } else if (currentFilter === 'active') {
                    emptyTitle.textContent = `${period}에 작성한 진행 중 메모가 없습니다.`;
                    emptyText.textContent = '완료된 메모를 확인하거나 다른 달을 선택해 보세요.';
                } else if (currentFilter === 'completed') {
                    emptyTitle.textContent = `${period}에 작성한 완료된 메모가 없습니다.`;
                    emptyText.textContent = '진행 중 메모를 확인하거나 다른 달을 선택해 보세요.';
                } else {
                    emptyTitle.textContent = `${period}에 작성한 메모가 없습니다.`;
                    emptyText.textContent = '다른 달이나 전체 기간을 선택해 지난 메모를 찾아보세요.';
                }
            } else if (searchQuery.trim()) {
                emptyTitle.textContent = '검색 결과가 없습니다.';
                emptyText.textContent = '다른 키워드로 검색해 보세요.';
            } else if (currentFilter === 'active') {
                emptyTitle.textContent = '진행 중인 할 일이 없습니다.';
                emptyText.textContent = '새로운 할 일을 추가하여 하루를 시작해보세요!';
            } else if (currentFilter === 'completed') {
                emptyTitle.textContent = '완료된 항목이 없습니다.';
                emptyText.textContent = '할 일을 마치고 체크박스를 눌러 완료해 보세요.';
            } else {
                emptyTitle.textContent = '오늘 해야 할 일을 모두 마쳤습니다!';
                emptyText.textContent = '새로운 메모나 해야 할 일을 작성해 보세요.';
            }
        } else if (currentFilter === 'timeline') {
            todoGrid.style.display = 'block';
            emptyState.style.display = 'none';
            renderTimeline(filtered);
        } else {
            todoGrid.style.display = 'grid';
            emptyState.style.display = 'none';

            filtered.forEach(todo => {
                const card = createTodoCard(todo);
                todoGrid.appendChild(card);
            });
        }

        // Initialize/Render Lucide Icons
        window.lucide?.createIcons();
        updateWriteControls();
    }

    function createTodoCard(todo) {
        const priority = Object.hasOwn(priorityLabels, todo.priority) ? todo.priority : 'p4';
        const kind = kindOf(todo);
        const isTodo = kind === 'todo';
        const card = document.createElement('article');
        card.className = `todo-card priority-${isTodo ? priority : 'p4'} kind-${kind} ${isTodo && todo.completed ? 'completed' : ''}`;
        card.setAttribute('data-id', todo.id);

        // Date String Formatting
        const createdDate = getCreatedDate(todo);
        const formattedDate = createdDate ? formatFullDate(createdDate) : '날짜 정보 없음';
        const doneDate = isTodo && todo.completed ? parseDate(todo.completedAt) : null;

        card.innerHTML = `
            <div class="todo-card-header">
                ${isTodo ? `<div class="checkbox-wrapper">
                    <button class="custom-checkbox" aria-label="할 일 완료 상태 토글">
                        <i data-lucide="check"></i>
                    </button>
                </div>` : `<div class="kind-icon" aria-hidden="true"><i data-lucide="${KINDS[kind].icon}"></i></div>`}
                <div class="todo-card-details">
                    <h3 class="todo-title-text">${escapeHTML(todo.title)}</h3>
                    ${todo.description ? `<p class="todo-desc-text">${escapeHTML(todo.description)}</p>` : ''}
                </div>
            </div>
            <button class="delete-btn" aria-label="${KINDS[kind].label} 삭제">
                <i data-lucide="trash-2"></i>
            </button>
            <div class="todo-card-footer">
                ${isTodo ? `<span class="priority-badge ${priority}">${priorityLabels[priority]}</span>` : `<span class="kind-badge kind-${kind}">${KINDS[kind].label}</span>`}
                <span class="card-date">
                    <i data-lucide="calendar-days"></i>
                    <span>${formattedDate}${doneDate ? ` · 완료 ${doneDate.getMonth() + 1}/${doneDate.getDate()}` : ''}</span>
                </span>
            </div>
        `;

        // Card event listeners
        // Toggle Completed (to-dos only — reviews and notes are records, not tasks)
        const checkbox = card.querySelector('.custom-checkbox');
        checkbox?.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleTodoComplete(todo.id);
        });

        // Delete Button Action with Animation
        const deleteBtn = card.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteTodo(todo.id);
        });

        return card;
    }

    // Date-by-date history: one section per day, newest day first.
    function groupByDay(items) {
        const days = new Map();
        items.forEach(todo => {
            const date = getActivityDate(todo);
            if (!date) return;
            const key = getDayKey(date);
            if (!days.has(key)) days.set(key, { date, items: [] });
            days.get(key).items.push(todo);
        });
        return [...days.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([, day]) => day);
    }

    function renderTimeline(items) {
        groupByDay(items).forEach(day => {
            const section = document.createElement('section');
            section.className = 'timeline-day';
            const rows = day.items.map(todo => {
                const kind = kindOf(todo);
                const undatedDone = kind === 'todo' && !parseDate(todo.completedAt);
                return `
                <li class="timeline-item kind-${kind}">
                    <span class="timeline-icon" aria-hidden="true"><i data-lucide="${kind === 'todo' ? 'check-circle-2' : KINDS[kind].icon}"></i></span>
                    <div class="timeline-body">
                        <p class="timeline-title"><span class="kind-badge kind-${kind}">${kind === 'todo' ? '완료' : KINDS[kind].label}</span>${escapeHTML(todo.title)}</p>
                        ${todo.description ? `<p class="timeline-desc">${escapeHTML(todo.description)}</p>` : ''}
                        ${undatedDone ? '<p class="timeline-note">완료일이 기록되기 전에 끝낸 할 일이라 작성일에 표시합니다.</p>' : ''}
                    </div>
                </li>`;
            }).join('');
            section.innerHTML = `
                <h3 class="timeline-date">${formatDay(day.date)} <span>${day.items.length}건</span></h3>
                <ul class="timeline-list">${rows}</ul>`;
            todoGrid.appendChild(section);
        });
    }

    // Markdown export for the Obsidian vault (강의자료/수업후기 or anywhere).
    function exportMarkdown() {
        const previous = currentFilter;
        currentFilter = 'timeline';
        const items = getFilteredAndSortedTodos();
        currentFilter = previous;
        const days = groupByDay(items).reverse(); // oldest first reads like a diary
        const period = formatMonth(selectedMonth);
        const count = kind => items.filter(todo => kindOf(todo) === kind).length;
        const lines = [
            `# AmberTodo 기록 — ${period}`,
            `> 내보낸 날: ${formatFullDate(new Date())} · 완료한 할 일 ${count('todo')} · 수업 후기 ${count('lesson')} · 기록 ${count('note')}`,
            ''
        ];
        if (!days.length) lines.push('_이 기간에 남긴 기록이 없습니다._', '');
        days.forEach(day => {
            lines.push(`## ${getDayKey(day.date)} (${WEEKDAYS[day.date.getDay()]})`, '');
            day.items.filter(todo => kindOf(todo) === 'todo').forEach(todo => {
                lines.push(`- [x] ${todo.title}${todo.description ? ` — ${todo.description.replace(/\s*\n\s*/g, ' / ')}` : ''}`);
            });
            day.items.filter(todo => kindOf(todo) === 'note').forEach(todo => {
                lines.push(`- 📝 ${todo.title}${todo.description ? ` — ${todo.description.replace(/\s*\n\s*/g, ' / ')}` : ''}`);
            });
            day.items.filter(todo => kindOf(todo) === 'lesson').forEach(todo => {
                lines.push('', `### 수업 후기 — ${todo.title}`, '', todo.description || '_(내용 없음)_');
            });
            lines.push('');
        });
        const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `AmberTodo_기록_${selectedMonth === 'all' ? '전체' : selectedMonth}.md`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }

    // HTML Escape Helper to prevent XSS
    function escapeHTML(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // ==========================================================================
    // Filter & Sort Logics
    // ==========================================================================
    function getFilteredAndSortedTodos() {
        // 1. Filter by category
        let result = todos.filter(todo => {
            const kind = kindOf(todo);
            if (currentFilter === 'active') return kind === 'todo' && !todo.completed;
            if (currentFilter === 'completed') return kind === 'todo' && todo.completed;
            if (currentFilter === 'lesson' || currentFilter === 'note') return kind === currentFilter;
            if (currentFilter === 'timeline') return Boolean(getActivityDate(todo));
            return true; // 'all'
        });

        // 2. Filter by search query
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim();
            result = result.filter(todo => 
                todo.title.toLowerCase().includes(query) || 
                (todo.description && todo.description.toLowerCase().includes(query))
            );
        }

        // 3. Filter by local calendar month (creation, or activity day in the history view).
        if (selectedMonth !== 'all') {
            result = result.filter(todo => {
                const viewDate = getViewDate(todo);
                return viewDate && getMonthKey(viewDate) === selectedMonth;
            });
        }

        // 4. Sort (the history view is always newest activity first)
        if (currentFilter === 'timeline') {
            return result.sort((a, b) => getActivityDate(b) - getActivityDate(a));
        }
        result.sort((a, b) => {
            if (sortMethod === 'newest') {
                return b.id - a.id;
            }
            if (sortMethod === 'oldest') {
                return a.id - b.id;
            }
            if (sortMethod === 'priority-desc') {
                const diff = priorityWeight[b.priority] - priorityWeight[a.priority];
                return diff !== 0 ? diff : b.id - a.id; // 동일 우선순위 시 최신순
            }
            if (sortMethod === 'priority-asc') {
                const diff = priorityWeight[a.priority] - priorityWeight[b.priority];
                return diff !== 0 ? diff : b.id - a.id; // 동일 우선순위 시 최신순
            }
            return 0;
        });

        return result;
    }

    // ==========================================================================
    // Core Actions
    // ==========================================================================
    async function toggleTodoComplete(id) {
        if (!canWrite) return;
        const todo = todos.find(item => item.id === id);
        if (!todo) return;
        await account.mutate(async userId => {
            const saved = await window.AmberCloud.setCompleted(id, !todo.completed, userId);
            return () => {
                todos = todos.map(item => item.id === id ? saved : item);
                updateStatistics();
                renderTodos();
            };
        }, '완료 상태를 저장했습니다.');
    }

    async function deleteTodo(id) {
        if (!canWrite) return;
        await account.mutate(async userId => {
            await window.AmberCloud.remove(id, userId);
            return () => {
                todos = todos.filter(todo => todo.id !== id);
                updateStatistics();
                renderTodos();
            };
        }, '메모를 삭제했습니다.');
    }

    function updateStatistics() {
        // Progress counts to-dos only; reviews and notes are records, not tasks.
        const tasks = todos.filter(t => kindOf(t) === 'todo');
        const total = tasks.length;
        const active = tasks.filter(t => !t.completed).length;
        const completed = tasks.filter(t => t.completed).length;

        // Counter Badges
        countAll.textContent = todos.length;
        countActive.textContent = active;
        countCompleted.textContent = completed;
        countTimeline.textContent = todos.filter(t => getActivityDate(t)).length;
        countLesson.textContent = todos.filter(t => kindOf(t) === 'lesson').length;
        countNote.textContent = todos.filter(t => kindOf(t) === 'note').length;

        // Daily Progress (Todoist Karma)
        let percent = 0;
        if (total > 0) {
            percent = Math.round((completed / total) * 100);
        }

        karmaPercent.textContent = `${percent}%`;
        karmaProgressBar.style.width = `${percent}%`;

        // Interactive Stats Message
        let statusMsg = '오늘도 활기차게 시작해봐요! 💪';
        if (percent === 0 && total > 0) {
            statusMsg = '할 일이 등록되었습니다. 하나씩 해결해 봐요! ✍️';
        } else if (percent > 0 && percent < 40) {
            statusMsg = '조금씩 해내고 있어요! 한 걸음 더! 🏃';
        } else if (percent >= 40 && percent < 80) {
            statusMsg = '절반 가량 완료했네요! 멋진 기세입니다! 🔥';
        } else if (percent >= 80 && percent < 100) {
            statusMsg = '거의 다 끝났어요! 조금만 더 힘내세요! 🚀';
        } else if (percent === 100 && total > 0) {
            statusMsg = '오늘 할 일을 완벽하게 끝냈습니다! 🎉 대단해요!';
        }
        karmaStatusText.textContent = statusMsg;
    }

    // ==========================================================================
    // Event Handlers & Registrations
    // ==========================================================================
    function registerEvents() {
        // Theme Toggle Handler
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
        });

        // Form Submit Action (Add Todo)
        todoForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!canWrite) return;

            const title = todoTitleInput.value.trim();
            const desc = todoDescInput.value.trim();
            
            if (!title) {
                // Shake input container on error
                const inputWrapper = todoTitleInput.parentElement;
                inputWrapper.classList.add('shake');
                setTimeout(() => inputWrapper.classList.remove('shake'), 500);
                return;
            }

            // Get selected priority and kind
            const checkedPriority = document.querySelector('input[name="priority"]:checked');
            const priority = checkedPriority ? checkedPriority.value : 'p2';
            const kind = currentKind();
            // An untouched review template is not content worth saving.
            const description = kind === 'lesson' && desc === LESSON_TEMPLATE.trim() ? '' : desc;

            const newTodo = {
                id: Date.now(),
                kind: kind,
                title: title,
                description: description,
                priority: kind === 'todo' ? priority : 'p4',
                completed: false,
                createdAt: new Date().toISOString()
            };

            const saved = await account.mutate(async userId => {
                const record = await window.AmberCloud.add(newTodo, userId);
                return () => {
                    todos.push(record);
                    if (selectedMonth !== 'all') selectedMonth = getMonthKey(new Date());
                    currentFilter = 'all';
                    searchQuery = '';
                    searchInput.value = '';
                    sidebarNavItems.forEach(item => item.classList.toggle('active', item.dataset.filter === 'all'));
                    updateStatistics();
                    renderTodos();
                    todoTitleInput.value = '';
                    todoDescInput.value = '';
                    applyKindToForm();
                };
            }, `${KINDS[kind].label} — 내 계정에 저장했습니다.`);
            if (saved) todoTitleInput.focus();
        });

        // Kind chips change the placeholders, the review template and the priority row.
        document.querySelectorAll('input[name="kind"]').forEach(radio => {
            radio.addEventListener('change', applyKindToForm);
        });

        exportButton.addEventListener('click', exportMarkdown);

        // Monthly history changes only the view, never the stored records.
        monthSelect.addEventListener('change', () => {
            selectedMonth = monthSelect.value;
            renderTodos();
        });
        previousMonthButton.addEventListener('click', () => moveMonth(-1));
        nextMonthButton.addEventListener('click', () => moveMonth(1));
        currentMonthButton.addEventListener('click', () => {
            selectedMonth = getMonthKey(new Date());
            renderTodos();
        });

        // Search Input Typing
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value;
            renderTodos();
        });

        // Sort Selection Change
        sortSelect.addEventListener('change', (e) => {
            sortMethod = e.target.value;
            renderTodos();
        });

        // Sidebar Navigation Tabs Filter
        sidebarNavItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                
                sidebarNavItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');

                currentFilter = item.getAttribute('data-filter');
                renderTodos();

                // Close mobile sidebar if open
                if (appSidebar.classList.contains('sidebar-open')) {
                    closeMobileSidebar();
                }
            });
        });

        // Mobile Menu Button Event
        menuToggle.addEventListener('click', () => {
            if (appSidebar.classList.contains('sidebar-open')) {
                closeMobileSidebar();
            } else {
                openMobileSidebar();
            }
        });
    }

    function currentKind() {
        const checked = document.querySelector('input[name="kind"]:checked');
        return checked && Object.hasOwn(KINDS, checked.value) ? checked.value : 'todo';
    }

    function applyKindToForm() {
        const kind = currentKind();
        todoTitleInput.placeholder = KINDS[kind].title;
        todoDescInput.placeholder = KINDS[kind].desc;
        prioritySelector.hidden = kind !== 'todo';
        // Fill the three-line template only into an empty box; never overwrite typing.
        const desc = todoDescInput.value.trim();
        if (kind === 'lesson' && !desc) todoDescInput.value = LESSON_TEMPLATE;
        if (kind !== 'lesson' && desc === LESSON_TEMPLATE.trim()) todoDescInput.value = '';
        todoDescInput.rows = kind === 'lesson' ? 4 : 2;
    }

    // ==========================================================================
    // Mobile Sidebar Helpers
    // ==========================================================================
    function openMobileSidebar() {
        appSidebar.classList.add('sidebar-open');
        
        // Add Overlay Dimmer
        const overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        overlay.id = 'sidebarOverlay';
        document.body.appendChild(overlay);

        overlay.addEventListener('click', closeMobileSidebar);
    }

    function closeMobileSidebar() {
        appSidebar.classList.remove('sidebar-open');
        const overlay = document.getElementById('sidebarOverlay');
        if (overlay) {
            overlay.remove();
        }
    }

    // Run Initialization
    init();
});
