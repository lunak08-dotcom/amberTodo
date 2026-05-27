document.addEventListener('DOMContentLoaded', () => {
    // ==========================================================================
    // State & Constants
    // ==========================================================================
    let todos = [];
    let currentFilter = 'all';
    let searchQuery = '';
    let sortMethod = 'newest';

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

    // DOM Elements
    const todoForm = document.getElementById('todoForm');
    const todoTitleInput = document.getElementById('todoTitle');
    const todoDescInput = document.getElementById('todoDesc');
    const todoGrid = document.getElementById('todoGrid');
    const emptyState = document.getElementById('emptyState');
    const searchInput = document.getElementById('searchInput');
    const sortSelect = document.getElementById('sortSelect');
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

        // Load Todos
        const savedTodos = localStorage.getItem('todos');
        if (savedTodos) {
            try {
                todos = JSON.parse(savedTodos);
            } catch (e) {
                console.error("로컬 스토리지 데이터 파싱 오류:", e);
                todos = [];
            }
        }

        // Set Current Date & Greeting
        updateDateTime();
        setInterval(updateDateTime, 60000); // 1분마다 업데이트

        // Event Listeners Registration
        registerEvents();

        // Initial Render
        renderTodos();
        updateStatistics();
    }

    // ==========================================================================
    // Date & Time Helpers
    // ==========================================================================
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
    function saveTodos() {
        localStorage.setItem('todos', JSON.stringify(todos));
        updateStatistics();
    }

    // ==========================================================================
    // Render Functions
    // ==========================================================================
    function renderTodos() {
        const filtered = getFilteredAndSortedTodos();
        
        // Clear Grid
        todoGrid.innerHTML = '';

        if (filtered.length === 0) {
            todoGrid.style.display = 'none';
            emptyState.style.display = 'flex';
            
            // Adjust empty state text depending on active filter/search
            const emptyTitle = emptyState.querySelector('h3');
            const emptyText = emptyState.querySelector('p');
            if (searchQuery) {
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
        } else {
            todoGrid.style.display = 'grid';
            emptyState.style.display = 'none';

            filtered.forEach(todo => {
                const card = createTodoCard(todo);
                todoGrid.appendChild(card);
            });
        }

        // Initialize/Render Lucide Icons
        lucide.createIcons();
    }

    function createTodoCard(todo) {
        const card = document.createElement('article');
        card.className = `todo-card priority-${todo.priority} ${todo.completed ? 'completed' : ''}`;
        card.setAttribute('data-id', todo.id);

        // Date String Formatting
        const createdDate = new Date(todo.createdAt);
        const formattedDate = `${createdDate.getMonth() + 1}월 ${createdDate.getDate()}일`;

        card.innerHTML = `
            <div class="todo-card-header">
                <div class="checkbox-wrapper">
                    <button class="custom-checkbox" aria-label="할 일 완료 상태 토글">
                        <i data-lucide="check"></i>
                    </button>
                </div>
                <div class="todo-card-details">
                    <h3 class="todo-title-text">${escapeHTML(todo.title)}</h3>
                    ${todo.description ? `<p class="todo-desc-text">${escapeHTML(todo.description)}</p>` : ''}
                </div>
            </div>
            <button class="delete-btn" aria-label="할 일 삭제">
                <i data-lucide="trash-2"></i>
            </button>
            <div class="todo-card-footer">
                <span class="priority-badge ${todo.priority}">${priorityLabels[todo.priority]}</span>
                <span class="card-date">
                    <i data-lucide="calendar-days"></i>
                    <span>${formattedDate}</span>
                </span>
            </div>
        `;

        // Card event listeners
        // Toggle Completed
        const checkbox = card.querySelector('.custom-checkbox');
        checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleTodoComplete(todo.id);
        });

        // Delete Button Action with Animation
        const deleteBtn = card.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            animateAndDeleteCard(todo.id, card);
        });

        return card;
    }

    // HTML Escape Helper to prevent XSS
    function escapeHTML(str) {
        return str
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
            if (currentFilter === 'active') return !todo.completed;
            if (currentFilter === 'completed') return todo.completed;
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

        // 3. Sort
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
    function toggleTodoComplete(id) {
        todos = todos.map(todo => {
            if (todo.id === id) {
                return { ...todo, completed: !todo.completed };
            }
            return todo;
        });
        saveTodos();
        renderTodos();
    }

    function animateAndDeleteCard(id, cardElement) {
        cardElement.classList.add('card-exit');
        cardElement.addEventListener('animationend', () => {
            todos = todos.filter(todo => todo.id !== id);
            saveTodos();
            renderTodos();
        }, { once: true });
    }

    function updateStatistics() {
        const total = todos.length;
        const active = todos.filter(t => !t.completed).length;
        const completed = todos.filter(t => t.completed).length;

        // Counter Badges
        countAll.textContent = total;
        countActive.textContent = active;
        countCompleted.textContent = completed;

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
        todoForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const title = todoTitleInput.value.trim();
            const desc = todoDescInput.value.trim();
            
            if (!title) {
                // Shake input container on error
                const inputWrapper = todoTitleInput.parentElement;
                inputWrapper.classList.add('shake');
                setTimeout(() => inputWrapper.classList.remove('shake'), 500);
                return;
            }

            // Get selected priority
            const checkedPriority = document.querySelector('input[name="priority"]:checked');
            const priority = checkedPriority ? checkedPriority.value : 'p2';

            const newTodo = {
                id: Date.now(),
                title: title,
                description: desc,
                priority: priority,
                completed: false,
                createdAt: new Date().toISOString()
            };

            todos.push(newTodo);
            saveTodos();
            renderTodos();

            // Clear Input Form
            todoTitleInput.value = '';
            todoDescInput.value = '';
            
            // Focus reset
            todoTitleInput.focus();
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
