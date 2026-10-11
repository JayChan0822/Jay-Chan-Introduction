// Every shared page URL enters the continuous website at its matching section.
const sections = [...document.querySelectorAll('[data-scroll-page]')];
if (sections.length) {
    const byPage = new Map(sections.map(section => [section.dataset.scrollPage, section]));
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    history.scrollRestoration = 'manual';
    const entrySections = { about: 'about', portfolio: 'music', visual: 'scoring', notation: 'notation', work: 'projects' };
    const entryPage = entrySections[location.hash.slice(1)];
    let activePage = 'home';
    let navigating = false;
    let navigationTimer;
    let queued = false;
    const initialUrl = new URL(location.href);
    initialUrl.searchParams.delete('lang');
    history.replaceState({ ...history.state, scrollPage: 'home' }, '', initialUrl.pathname + initialUrl.search + initialUrl.hash);

    const pageUrl = page => {
        const url = new URL(page === 'home' ? 'index.html' : `${page}.html`, location.href);
        url.search = location.search;
        url.searchParams.delete('lang');
        return url;
    };
    const activate = (page, push = false) => {
        const section = byPage.get(page);
        if (!section) return;
        const url = pageUrl(page);
        if (page !== activePage || push) {
            const state = { ...history.state, scrollPage: page };
            history[push ? 'pushState' : 'replaceState'](state, '', url.pathname + url.search);
        }
        activePage = page;
        ['title', 'description'].forEach(key => {
            document.body.dataset[key] = section.dataset[key];
        });
        document.querySelector('link[rel="canonical"]').href = `https://www.jaychan.cn/${page === 'home' ? '' : page + '.html'}`;
        document.querySelector('meta[property="og:url"]').content = `https://www.jaychan.cn/${page === 'home' ? '' : page + '.html'}`;
        document.querySelectorAll('.nav-base a').forEach(link => {
            const slug = new URL(link.href).pathname.split('/').pop().replace('.html', '');
            if (slug === page) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        });
        document.title = section.dataset.title;
        const description = section.dataset.description;
        document.querySelector('meta[name="description"]').content = description;
        for (const name of ['og:title', 'twitter:title']) {
            document.querySelector(`meta[property="${name}"], meta[name="${name}"]`).content = document.title;
        }
        for (const name of ['og:description', 'twitter:description']) {
            document.querySelector(`meta[property="${name}"], meta[name="${name}"]`).content = description;
        }
    };
    const updateFromScroll = () => {
        queued = false;
        if (navigating || document.body.classList.contains('modal-open')) return;
        // Switch when the next section occupies the reading area, and reverse
        // the address just as naturally when the visitor scrolls upwards.
        const line = innerHeight * 0.4;
        let page = 'home';
        for (const section of sections) {
            if (section.getBoundingClientRect().top <= line) page = section.dataset.scrollPage;
        }
        if (page !== activePage) activate(page);
    };
    const navigate = (page, push, instant = false) => {
        const section = byPage.get(page);
        if (!section) return;
        clearTimeout(navigationTimer);
        navigating = true;
        activate(page, push);
        const top = page === 'home' ? 0 : scrollY + section.getBoundingClientRect().top - 110;
        window.scrollTo({ top: Math.max(0, top), behavior: reducedMotion || instant ? 'instant' : 'smooth' });
        navigationTimer = setTimeout(() => { navigating = false; updateFromScroll(); }, reducedMotion || instant ? 0 : 1200);
    };
    document.addEventListener('click', event => {
        const link = event.target.closest('a[href]');
        if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target || link.hasAttribute('download')) return;
        const url = new URL(link.href);
        if (url.origin !== location.origin || url.hash) return;
        const file = url.pathname.split('/').pop();
        const page = file === 'index.html' ? 'home' : file.replace('.html', '');
        if (!byPage.has(page)) return;
        event.preventDefault();
        navigate(page, page !== activePage);
    });
    window.addEventListener('scroll', () => {
        if (!queued) { queued = true; requestAnimationFrame(updateFromScroll); }
    }, { passive: true });
    const releaseNavigation = () => {
        clearTimeout(navigationTimer);
        navigating = false;
    };
    window.addEventListener('wheel', releaseNavigation, { passive: true });
    window.addEventListener('touchstart', releaseNavigation, { passive: true });
    window.addEventListener('scrollend', () => { releaseNavigation(); updateFromScroll(); });
    window.addEventListener('resize', updateFromScroll);
    window.addEventListener('popstate', event => {
        const file = location.pathname.split('/').pop();
        navigate(event.state?.scrollPage || (file === 'index.html' || !file ? 'home' : file.replace('.html', '')), false);
    });
    if (entryPage) navigate(entryPage, false, true);
    window.addEventListener('pageshow', updateFromScroll);
}
