// Every shared page URL enters the continuous website at its matching section.
const sections = [...document.querySelectorAll('[data-scroll-page]')];
if (sections.length) {
    const byPage = new Map(sections.map(section => [section.dataset.scrollPage, section]));
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    history.scrollRestoration = 'manual';
    const entrySections = { about: 'about', portfolio: 'music', visual: 'scoring', notation: 'notation', work: 'projects' };
    const pageFromPath = path => {
        const slug = path.replace(/^\/|\/$/g, '').replace(/\.html$/, '');
        return !slug || slug === 'index' ? 'home' : slug;
    };
    const requestedPage = pageFromPath(location.pathname);
    const entryPage = entrySections[location.hash.slice(1)] || (byPage.has(requestedPage) ? requestedPage : 'home');
    let activePage = 'home';
    let navigating = false;
    let navigationTimer;
    let queued = false;
    const initialUrl = new URL(location.href);
    initialUrl.searchParams.delete('lang');
    history.replaceState({ ...history.state, scrollPage: 'home' }, '', initialUrl.pathname + initialUrl.search + initialUrl.hash);

    const pageUrl = page => {
        const url = new URL(page === 'home' ? '/' : `/${page}`, location.origin);
        url.search = location.search;
        url.searchParams.delete('lang');
        return url;
    };
    const activate = (page, push = false) => {
        const section = byPage.get(page);
        if (!section) return;
        const url = pageUrl(page);
        if (page !== activePage || push || location.pathname !== url.pathname || location.hash) {
            const state = { ...history.state, scrollPage: page };
            history[push ? 'pushState' : 'replaceState'](state, '', url.pathname + url.search);
        }
        activePage = page;
        ['title', 'description'].forEach(key => {
            document.body.dataset[key] = section.dataset[key];
        });
        document.querySelector('link[rel="canonical"]').href = `https://www.jaychan.cn/${page === 'home' ? '' : page}`;
        document.querySelector('meta[property="og:url"]').content = `https://www.jaychan.cn/${page === 'home' ? '' : page}`;
        document.querySelectorAll('.nav-base a').forEach(link => {
            const slug = pageFromPath(new URL(link.href).pathname);
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
        // Align the content, rather than the section's padded outer edge.
        // Measure the navigation links so wrapped mobile menus remain clear.
        const navBottom = Math.max(0, ...[...document.querySelectorAll('.nav-base a')]
            .map(link => link.getBoundingClientRect().bottom));
        const contentTop = scrollY + section.getBoundingClientRect().top
            + parseFloat(getComputedStyle(section).paddingTop);
        const top = page === 'home' ? 0 : contentTop - navBottom - 32;
        window.scrollTo({ top: Math.max(0, top), behavior: reducedMotion || instant ? 'instant' : 'smooth' });
        navigationTimer = setTimeout(() => { navigating = false; updateFromScroll(); }, reducedMotion || instant ? 0 : 1200);
    };
    document.addEventListener('click', event => {
        const link = event.target.closest('a[href]');
        if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target || link.hasAttribute('download')) return;
        const url = new URL(link.href);
        if (url.origin !== location.origin || url.hash) return;
        const page = pageFromPath(url.pathname);
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
        navigate(event.state?.scrollPage || pageFromPath(location.pathname), false);
    });
    if (entryPage) navigate(entryPage, false, true);
    window.addEventListener('pageshow', updateFromScroll);
}
