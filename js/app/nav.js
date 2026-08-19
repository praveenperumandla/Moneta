import { setCurrentBorrowerId } from './state.js';
import { bus } from './bus.js';

export const switchView = (viewId) => {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => {
        el.classList.remove('active');
        const icon = el.querySelector('i');
        if (icon) {
            icon.classList.remove('ph-fill');
            icon.classList.add('ph');
        }
    });

    const section = document.getElementById('view-' + viewId);
    if (section) section.classList.add('active');

    const tab = document.querySelector(`.tab-btn[data-view="${viewId}"]`);
    if (tab) {
        tab.classList.add('active');
        const icon = tab.querySelector('i');
        if (icon) {
            icon.classList.remove('ph');
            icon.classList.add('ph-fill');
        }
    }

    if (viewId === 'borrowers' || viewId === 'home' || viewId === 'transactions') setCurrentBorrowerId(null);

    const appMain = document.getElementById('app-main');
    if (appMain) appMain.scrollTop = 0;
    document.getElementById('tab-bar')?.classList.remove('tab-bar--hidden');

    bus.refreshUI();
};

export const bindNav = () => {
    document.querySelectorAll('.tab-btn[data-view]').forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });
};

export const bindSwipeBack = () => {
    const EDGE = 24, THRESHOLD = 60, VEL = 0.3;
    let sx = 0, sy = 0, st = 0, dragging = false, horiz = null;

    document.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now();
        horiz = null; dragging = false;
        const ledgerActive = document.getElementById('view-ledger')?.classList.contains('active');
        if (ledgerActive && sx <= EDGE) dragging = true;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!dragging || e.touches.length !== 1) return;
        const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
        if (horiz === null && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
            horiz = Math.abs(dx) > Math.abs(dy);
        }
        if (horiz === false) { dragging = false; }
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if (!dragging || horiz !== true) { dragging = false; return; }
        dragging = false;
        const dx = e.changedTouches[0].clientX - sx;
        const vel = Math.abs(dx) / (Date.now() - st);
        const ledgerActive = document.getElementById('view-ledger')?.classList.contains('active');
        if (ledgerActive && (dx > THRESHOLD || (dx > 10 && vel > VEL))) {
            switchView('borrowers');
        }
    }, { passive: true });
};

export const bindTabBarAutoHide = () => {
    const mainEl = document.getElementById('app-main');
    const tabBar = document.getElementById('tab-bar');
    if (!mainEl || !tabBar) return;

    let lastScrollTop = 0;
    const SCROLL_DELTA_THRESHOLD = 8;

    mainEl.addEventListener('scroll', () => {
        const currentScroll = mainEl.scrollTop;
        const delta = currentScroll - lastScrollTop;

        if (currentScroll <= 15) {
            tabBar.classList.remove('tab-bar--hidden');
            lastScrollTop = currentScroll;
            return;
        }

        if (delta > SCROLL_DELTA_THRESHOLD) {
            tabBar.classList.add('tab-bar--hidden');
        } else if (delta < -SCROLL_DELTA_THRESHOLD) {
            tabBar.classList.remove('tab-bar--hidden');
        }

        lastScrollTop = currentScroll;
    }, { passive: true });
};
