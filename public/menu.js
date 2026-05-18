(function () {
    /** Staff üst çubuğunda ad soyad gösterme (veli paneli hariç) */
    function hideStaffHeaderDisplayName() {
        const el = document.getElementById('currentUserName');
        if (!el) return;
        const header = el.closest('.header');
        if (!header || header.classList.contains('header-veli')) return;
        el.textContent = '';
        el.setAttribute('aria-hidden', 'true');
        el.style.setProperty('display', 'none', 'important');
    }

    function buildMenu() {
        const userRaw = localStorage.getItem('currentUser');
        if (!userRaw) return;

        const user = JSON.parse(userRaw);
        const navMenu = document.getElementById('navMenu');
        if (!navMenu) return;

        let items = [];

        if (user.rol === 'admin' || user.rol === 'yonetici') {
            items = [
                { href: 'dashboard.html', text: '📊 Dashboard' },
                { href: 'index.html', text: '👥 Öğrenciler' },
                { href: 'gruplar.html', text: '📊 Gruplar' },
                // { href: 'testler.html', text: '🧪 Testler' }, // Gizli - ileride tekrar açılabilir
                { href: 'odemeler.html', text: '💰 Ödemeler' },
                { href: 'donemler.html', text: '📅 Dönemler' },
                { href: 'raporlar.html', text: '📑 Raporlar' }
            ];

            if (user.rol === 'admin') {
                items.push({ href: 'subeler.html', text: '🏢 Şubeler' });
                items.push({ href: 'kullanicilar.html', text: '🔐 Kullanıcılar', isAdmin: true });
            } else if (user.rol === 'yonetici') {
                items.push({ href: 'kullanicilar.html', text: '🔐 Kullanıcılar' });
            }
        } else if (user.rol === 'antrenor') {
            items = [
                { href: 'gruplar.html', text: '📊 Gruplar' }
                // { href: 'testler.html', text: '🧪 Testler' } // Gizli - ileride tekrar açılabilir
            ];
        }

        const linksHtml = items
            .map(item => {
                const classes = item.isAdmin ? 'nav-link admin-link' : 'nav-link';
                return `<a href="${item.href}" class="${classes}">${item.text}</a>`;
            })
            .join('');

        navMenu.className = 'nav-wrapper';
        navMenu.innerHTML = '<button class="hamburger-btn" type="button" aria-label="Menüyü aç" aria-expanded="false">☰</button><div class="nav-links">' + linksHtml + '</div>';

        const hamburger = navMenu.querySelector('.hamburger-btn');
        const navLinks = navMenu.querySelector('.nav-links');
        if (hamburger && navLinks) {
            hamburger.addEventListener('click', function () {
                const open = navLinks.classList.toggle('nav-open');
                hamburger.setAttribute('aria-expanded', open);
                hamburger.textContent = open ? '✕' : '☰';
            });
            document.addEventListener('click', function (e) {
                if (navLinks.classList.contains('nav-open') && !navMenu.contains(e.target)) {
                    navLinks.classList.remove('nav-open');
                    hamburger.setAttribute('aria-expanded', 'false');
                    hamburger.textContent = '☰';
                }
            });
        }

        hideStaffHeaderDisplayName();
        setTimeout(hideStaffHeaderDisplayName, 0);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', buildMenu);
    } else {
        buildMenu();
    }
})();
