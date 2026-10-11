// 1. WaveSurfer 改为「动态引入 + 多源兜底」。
    //    原本是顶层静态 import：CDN 一挂，整个模块一行都不执行，
    //    而全站内容默认 opacity:0，结果就是首屏以下全白。
    //    现在换成 import()，失败只影响波形，其余交互不受牵连。
    const WAVESURFER_SOURCES = [
        // 阿里云 npm 镜像放在第一位：国内解析快且稳定，和你的 OSS 同属一张网
        'https://registry.npmmirror.com/wavesurfer.js/7.12.11/files/dist/wavesurfer.esm.js',
        'https://cdn.jsdelivr.net/npm/wavesurfer.js@7.12.11/dist/wavesurfer.esm.js'
    ];

    let waveSurferPromise = null;
    const loadWaveSurfer = () => {
        if (waveSurferPromise) return waveSurferPromise;
        waveSurferPromise = (async () => {
            for (const src of WAVESURFER_SOURCES) {
                try {
                    const mod = await import(/* @vite-ignore */ src);
                    return mod.default;
                } catch (err) {
                    console.warn('[audio] WaveSurfer 源加载失败，尝试下一个：', src, err);
                }
            }
            throw new Error('所有 WaveSurfer 源均不可用');
        })();
        return waveSurferPromise;
    };

    // 初始化 CSS 变量
    document.body.style.setProperty('--mouse-x', '-100px');
    document.body.style.setProperty('--mouse-y', '-100px');
    document.body.style.setProperty('--cursor-radius', '10px');

    const cursor = document.querySelector('.cursor');
    const triggers = document.querySelectorAll('.hover-trigger');
    const heroBg = document.querySelector('.hero-bg');
    const supportsFinePointer = window.matchMedia('(pointer: fine)').matches;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const enableCustomCursor = Boolean(cursor) && supportsFinePointer && !prefersReducedMotion;

    if (enableCustomCursor) {
        document.body.classList.add('custom-cursor-enabled');
        document.addEventListener('mousemove', (e) => {
            cursor.style.left = e.clientX + 'px';
            cursor.style.top = e.clientY + 'px';
            document.body.style.setProperty('--mouse-x', e.clientX + 'px');
            document.body.style.setProperty('--mouse-y', e.clientY + 'px');
            const moveX = (e.clientX - window.innerWidth / 2) * 0.01;
            const moveY = (e.clientY - window.innerHeight / 2) * 0.01;
            if (heroBg) heroBg.style.transform = `scale(1.1) translate(${moveX}px, ${moveY}px)`;
        });

        triggers.forEach(trigger => {
            trigger.addEventListener('mouseenter', () => {
                cursor.classList.add('hovered');
                document.body.style.setProperty('--cursor-radius', '25px');
            });
            trigger.addEventListener('mouseleave', () => {
                cursor.classList.remove('hovered');
                document.body.style.setProperty('--cursor-radius', '10px');
            });
        });
    } else if (cursor) {
        cursor.style.display = 'none';
    }

    // 播放/暂停图标用内联 SVG，不用 ▶ 和 || 这类字符：
    // 字体栈里（-apple-system / SF Pro / Helvetica Neue）根本没有 U+25B6 这个字形，
    // 只能回退到别的字体，实际渲染出来是个细长的 ">"，而且天然不居中。
    const ICON_PLAY  = '<svg class="icon-play" viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true" focusable="false"><path d="M8 5v14l11-7z"/></svg>';
    const ICON_PAUSE = '<svg class="icon-pause" viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true" focusable="false"><path d="M6.5 5h3.5v14H6.5zM14 5h3.5v14H14z"/></svg>';

    const activateOnEnterOrSpace = (event, action) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        action();
    };

    // ==========================================
    // 2. 全局媒体控制 & 真实波形渲染 (WaveSurfer)
    // ==========================================

    // 获取页面上所有的视频元素
    const videos = document.querySelectorAll('video');
    const tracks = document.querySelectorAll('.track');
    const projectCards = document.querySelectorAll('.project-card[data-url]');
    let activeSurfer = null; // 记录当前正在播放的音频

    const openExternalLink = (url) => {
        if (!url) return;
        const newWindow = window.open(url, '_blank', 'noopener,noreferrer');
        if (newWindow) newWindow.opener = null;
    };

    projectCards.forEach(card => {
        const url = card.getAttribute('data-url');
        const open = () => openExternalLink(url);
        card.addEventListener('click', open);
        card.addEventListener('keydown', (event) => activateOnEnterOrSpace(event, open));
    });

    tracks.forEach((track, index) => {
        const playBtn = track.querySelector('.play-btn');
        const title = track.querySelector('.track-info > div')?.textContent?.trim() || `音频 ${index + 1}`;
        if (!playBtn) return;
        playBtn.setAttribute('role', 'button');
        playBtn.setAttribute('tabindex', '0');
        playBtn.setAttribute('aria-label', siteI18n.mediaLabel("audio", title));
        playBtn.setAttribute('aria-pressed', 'false');
    });

    // --- 核心：全局暂停函数 ---
    // 传入 currentMedia，暂停除了 currentMedia 之外的所有音频和视频
    const pauseAllMedia = (currentMedia) => {
        // 1. 暂停其他波形音频
        if (activeSurfer && activeSurfer !== currentMedia && activeSurfer.isPlaying()) {
            activeSurfer.pause();
        }
        // 2. 暂停其他视频
        videos.forEach(video => {
            if (video !== currentMedia && !video.paused) {
                video.pause();
            }
        });
        // 3. 暂停降级出来的原生播放器（这些是运行时才插入的，不在上面的静态集合里）
        document.querySelectorAll('audio.native-audio-fallback').forEach(audio => {
            if (audio !== currentMedia && !audio.paused) {
                audio.pause();
            }
        });
    };

    // --- 监听所有视频的播放事件 ---
    videos.forEach(video => {
        video.addEventListener('play', () => {
            // 当任何视频开始播放时，暂停其他所有媒体
            pauseAllMedia(video);
        });
    });

    // --- 降级方案：波形库彻底不可用时，退回原生 audio，至少音乐还能听 ---
    const renderNativeAudioFallback = (track, waveformEl, playBtn, audioUrl) => {
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.preload = 'none';
        audio.src = audioUrl;
        audio.className = 'native-audio-fallback';
        waveformEl.replaceChildren(audio);
        waveformEl.classList.add('is-fallback');
        if (playBtn) playBtn.style.display = 'none';
        audio.addEventListener('play', () => {
            pauseAllMedia(audio);
            track.classList.add('playing');
        });
        audio.addEventListener('pause', () => track.classList.remove('playing'));
        audio.addEventListener('ended', () => track.classList.remove('playing'));
    };

    // --- WaveSurfer 音频逻辑 (优化版：滚动到可视区域才加载) ---
    // --- 预生成的波形数据 ---
    // WaveSurfer 要画波形，默认得把整首 mp3 下载下来再 decodeAudioData，
    // 14 首合计 102MB，访客只要滑过 SOUND 区就会被全部拉走——一次都没点播放也一样。
    // 改成读离线算好的 peaks.json（70KB），mp3 只在真正点播放时才流式加载。
    // peaks.json 由 scripts/gen_peaks.py 生成，换曲子后重跑一次即可。
    let peaksPromise = null;
    const loadPeaks = () => {
        if (!peaksPromise) {
            peaksPromise = fetch('peaks.json')
                .then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
                .catch(err => {
                    console.warn('[audio] peaks.json 读取失败，退回逐首下载解码', err);
                    return {}; // 拿不到就返回空表，下面会退回原来的 url 模式
                });
        }
        return peaksPromise;
    };

    const stemOf = (url) => {
        const file = url.split('/').pop().split('?')[0];
        return file.replace(/\.mp3$/i, '');
    };

    // 初始化单条曲目的波形与播放控制
    const initTrack = (track, WaveSurfer, peaksTable) => {
        const waveformEl = track.querySelector('.waveform');
        const playBtn = track.querySelector('.play-btn');
        const audioUrl = waveformEl?.getAttribute('data-src');

        if (!audioUrl || track.dataset.loaded === 'true') return;
        track.dataset.loaded = 'true';

        const cached = peaksTable[stemOf(audioUrl)];

        // 自己造 audio 元素并设 preload="none"，
        // 这样在用户按下播放之前，浏览器一个字节的 mp3 都不会去取
        const mediaEl = new Audio();
        mediaEl.preload = 'none';
        mediaEl.src = audioUrl;

        const wavesurfer = WaveSurfer.create({
            container: waveformEl,
            waveColor: '#444444',
            progressColor: '#ffffff',
            // 有预算好的峰值就走 media + peaks + duration（不下载 mp3）；
            // 没有就退回老路子，让 WaveSurfer 自己去 fetch 整首
            ...(cached
                ? { media: mediaEl, peaks: [cached.peaks], duration: cached.duration }
                : { url: audioUrl }),
            height: 40,
            barWidth: 2,
            barGap: 2,
            barRadius: 2,
            cursorColor: 'transparent',
            dragToSeek: true
        });

        // 波形画出来了就撤掉骨架占位
        const markReady = () => waveformEl.classList.add('is-ready');
        if (cached) markReady();          // 用预生成峰值时是同步绘制，可以立刻撤
        else wavesurfer.on('ready', markReady);

        // 立即绑定播放键，不再等 'ready'：
        // 用预生成峰值时波形是同步画出来的，ready 可能在监听器注册前就已经发过了
        const toggle = () => {
            if (!wavesurfer.isPlaying()) pauseAllMedia(wavesurfer);
            wavesurfer.playPause();
        };
        playBtn.addEventListener('click', toggle);
        playBtn.addEventListener('keydown', (event) => activateOnEnterOrSpace(event, toggle));

        wavesurfer.on('interaction', () => {
            pauseAllMedia(wavesurfer);
            wavesurfer.play();
        });

        wavesurfer.on('play', () => {
            activeSurfer = wavesurfer;
            playBtn.innerHTML = ICON_PAUSE;
            playBtn.setAttribute('aria-pressed', 'true');
            track.classList.add('playing');
        });

        wavesurfer.on('pause', () => {
            playBtn.innerHTML = ICON_PLAY;
            playBtn.setAttribute('aria-pressed', 'false');
            track.classList.remove('playing');
        });

        wavesurfer.on('finish', () => {
            playBtn.innerHTML = ICON_PLAY;
            playBtn.setAttribute('aria-pressed', 'false');
            track.classList.remove('playing');
        });

        // 音频文件本身取不到时（403 / 断网 / 跨域），同样退回原生播放器
        wavesurfer.on('error', (err) => {
            console.warn('[audio] 波形解码失败，已降级为原生播放器', audioUrl, err);
            try { wavesurfer.destroy(); } catch (_) {}
            if (playBtn) playBtn.style.display = '';
            markReady();
            renderNativeAudioFallback(track, waveformEl, playBtn, audioUrl);
        });
    };

    // 滚动到附近才初始化——只在「没有预生成峰值」时才需要，
    // 因为那种情况下每条波形都要现下载整首 mp3 来解码，绝不能一次性全开。
    const audioObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(async (entry) => {
            if (!entry.isIntersecting) return;
            const track = entry.target;
            observer.unobserve(track);
            try {
                const [WaveSurfer, peaksTable] = await Promise.all([loadWaveSurfer(), loadPeaks()]);
                initTrack(track, WaveSurfer, peaksTable);
            } catch (err) {
                console.warn('[audio] 波形库不可用，已降级为原生播放器', err);
                const waveformEl = track.querySelector('.waveform');
                waveformEl?.classList.add('is-ready');
                renderNativeAudioFallback(track, waveformEl, track.querySelector('.play-btn'),
                    waveformEl?.getAttribute('data-src'));
            }
        });
    }, { rootMargin: '100px 0px' });

    // 启动音频模块
    (async () => {
        if (!tracks.length) return;
        let WaveSurfer, peaksTable;
        try {
            [WaveSurfer, peaksTable] = await Promise.all([loadWaveSurfer(), loadPeaks()]);
        } catch (err) {
            console.warn('[audio] 波形库不可用，全部降级为原生播放器', err);
            tracks.forEach(track => {
                const waveformEl = track.querySelector('.waveform');
                waveformEl?.classList.add('is-ready');
                renderNativeAudioFallback(track, waveformEl, track.querySelector('.play-btn'),
                    waveformEl?.getAttribute('data-src'));
            });
            return;
        }

        if (Object.keys(peaksTable).length > 0) {
            // 有预生成峰值：绘制是纯本地运算、不产生任何网络请求，
            // 所以一次性全部画出来，避免用户滚到之前看到空框。
            tracks.forEach(track => initTrack(track, WaveSurfer, peaksTable));
        } else {
            // 没有峰值表：退回懒加载，否则 14 首会一次性拉走上百 MB
            tracks.forEach(track => audioObserver.observe(track));
        }
    })();

    // --- 苹果风格滚动动画触发器 ---
    // 注意：本脚本是 type="module"（自带 defer），执行时机可能已在 DOMContentLoaded 之后，
    // 那样监听器就永远等不到事件、全站停留在 opacity:0。所以改为「已就绪则立即执行」。
    const initRevealAnimations = () => {
        // 观察器选项：上下都内缩，制造「进入」与「退出」两条不同的判定线。
        //   进入：元素顶部越过「视口底部上方 12%」处 -> 飞入
        //   退出：元素底部越过「视口顶部下方 5%」处   -> 飞出
        // 两条线之间隔着差不多一整屏，元素停在边界上反复横跳时也不会闪。
        // 若上下都用 0，元素卡在边界会疯狂 toggle。
        const options = {
            root: null, // 使用浏览器视口作为根
            rootMargin: '-5% 0px -12% 0px',
            threshold: 0 // 双向切换用 0 更可预期：高元素永远到不了固定比例阈值
        };

        // 定义观察器的回调函数：进入加类、离开去类，双向都有动画。
        // 注意不能再 unobserve —— 那样只会触发一次。
        const observerCallback = (entries) => {
            entries.forEach(entry => {
                entry.target.classList.toggle('animate-active', entry.isIntersecting);
            });
        };

        // 创建观察器实例
        const observer = new IntersectionObserver(observerCallback, options);

        // 选取所有带有 .apple-animate 类的元素，开始观察它们
        const animateElements = document.querySelectorAll('.apple-animate');
        animateElements.forEach(el => observer.observe(el));
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initRevealAnimations, { once: true });
    } else {
        initRevealAnimations();
    }

    // ==========================================
    // 3. 视频独立弹窗逻辑 (Video Modal)
    // ==========================================
    const videoModal = document.getElementById('videoModal');
    const modalVideoPlayer = document.getElementById('modalVideoPlayer');
    const closeBtn = document.querySelector('.modal-close-btn');
    const modalOverlay = document.querySelector('.modal-overlay');
    const videoCards = document.querySelectorAll('.video-card');
    let previousFocusedElement = null;

    const getModalFocusableElements = () => {
        return Array.from(
            videoModal.querySelectorAll('button, [href], video, [tabindex]:not([tabindex="-1"])')
        ).filter(element => !element.hasAttribute('disabled'));
    };

    const openVideoModal = (videoSrc, triggerElement) => {
        if (!videoSrc) return;

        if (activeSurfer && activeSurfer.isPlaying()) {
            activeSurfer.pause();
        }

        previousFocusedElement = triggerElement instanceof HTMLElement ? triggerElement : document.activeElement;
        modalVideoPlayer.src = videoSrc;
        videoModal.classList.add('active');
        videoModal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
        document.documentElement.classList.add('modal-open');
        closeBtn.focus();
        modalVideoPlayer.play().catch(() => {});
    };

    // 监听视频卡片点击
    videoCards.forEach(card => {
        const title = card.querySelector('.video-title')?.textContent?.trim();
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        if (title) {
            card.setAttribute('aria-label', siteI18n.mediaLabel("video", title));
        }

        const open = () => openVideoModal(card.getAttribute('data-video'), card);
        card.addEventListener('click', open);
        card.addEventListener('keydown', (event) => activateOnEnterOrSpace(event, open));
    });

    // 关闭弹窗的公共函数
    const closeVideoModal = () => {
        if (!videoModal.classList.contains('active')) return;
        videoModal.classList.remove('active');
        videoModal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
        document.documentElement.classList.remove('modal-open');
        modalVideoPlayer.pause();
        // 延迟清除 src，等待淡出动画结束，避免闪烁
        setTimeout(() => {
            modalVideoPlayer.src = '';
        }, 400);

        if (previousFocusedElement instanceof HTMLElement) {
            previousFocusedElement.focus();
            previousFocusedElement = null;
        }
    };

    // 绑定关闭事件 (点击遮罩层或叉号)
    closeBtn.addEventListener('click', closeVideoModal);
    modalOverlay.addEventListener('click', closeVideoModal);
    document.addEventListener('keydown', (event) => {
        if (!videoModal.classList.contains('active')) return;

        if (event.key === 'Escape') {
            event.preventDefault();
            closeVideoModal();
            return;
        }

        if (event.key !== 'Tab') return;
        const focusableElements = getModalFocusableElements();
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (event.shiftKey && document.activeElement === firstElement) {
            event.preventDefault();
            lastElement.focus();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
            event.preventDefault();
            firstElement.focus();
        }
    });

    // 制谱作品页放大 lightbox
    const scoreModal = document.getElementById('scoreModal');
    const scoreModalImg = document.getElementById('scoreModalImg');
    const scoreCloseBtn = scoreModal.querySelector('.modal-close-btn');
    const scoreOverlay = scoreModal.querySelector('.modal-overlay');
    const scorePrevBtn = document.getElementById('scorePrevBtn');
    const scoreNextBtn = document.getElementById('scoreNextBtn');
    const scorePageIndicator = document.getElementById('scorePageIndicator');
    const scorePages = document.querySelectorAll('.score-page');
    let scorePrevFocus = null;
    let scoreGlobalIndex = 0;
    let scoreTouchStartX = null;

    // 全局有序页列表：按卡片顺序展平 9 作品 × 3 页 = 27 页，
    // 左右切换可跨作品浏览（第 3 页 → 下一作品第 1 页，循环）
    const scoreAllPages = [...document.querySelectorAll('.score-card')].flatMap(card =>
        [...card.querySelectorAll('.score-page')].map(page => ({
            full: page.getAttribute('data-full'),
            card,
        }))
    );

    // 找到某个 data-full 所在作品的首页（全局索引）——点任意页缩略图都从该作品第 1 页开始
    const indexOfWorkFirstPage = (imgSrc) => {
        const base = (imgSrc || '').split('/').pop().replace(/-p?\d+\.jpg$/, '');
        const i = scoreAllPages.findIndex(p => p.full && p.full.split('/').pop().startsWith(base + '-'));
        return i >= 0 ? i : 0;
    };

    const renderScorePage = () => {
        const page = scoreAllPages[scoreGlobalIndex];
        if (!page || !page.full) return;
        scoreModalImg.src = page.full;
        // 页内序号 = 当前页在全列表中相对该作品第一页的位置 + 1
        const base = page.full.split('/').pop().replace(/-p?\d+\.jpg$/, '');
        const first = indexOfWorkFirstPage(page.full);
        const inWork = scoreGlobalIndex - first + 1;
        const title = page.card.querySelector('.score-title')?.textContent?.trim() || '';
        scorePageIndicator.textContent = siteI18n.pageLabel(title, inWork);
        scorePrevBtn.style.visibility = scoreAllPages.length > 1 ? 'visible' : 'hidden';
        scoreNextBtn.style.visibility = scoreAllPages.length > 1 ? 'visible' : 'hidden';
        scoreModalImg.alt = siteI18n.pageLabel(title, inWork);
    };

    document.addEventListener('languagechange', () => {
        if (scoreModal.classList.contains('active')) renderScorePage();
    });

    const goScorePage = (dir) => {
        if (!scoreAllPages.length) return;
        scoreGlobalIndex = (scoreGlobalIndex + dir + scoreAllPages.length) % scoreAllPages.length;
        renderScorePage();
    };

    const openScoreModal = (imgSrc, triggerElement) => {
        if (!imgSrc) return;
        if (activeSurfer && activeSurfer.isPlaying()) activeSurfer.pause();
        scorePrevFocus = triggerElement instanceof HTMLElement ? triggerElement : document.activeElement;
        // 总是从该作品第 1 页开始（点任意页缩略图，期望看到从首页起）
        scoreGlobalIndex = indexOfWorkFirstPage(imgSrc);
        renderScorePage();
        scoreModal.classList.add('active');
        scoreModal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
        document.documentElement.classList.add('modal-open');
        scoreCloseBtn.focus();
    };

    const closeScoreModal = () => {
        if (!scoreModal.classList.contains('active')) return;
        scoreModal.classList.remove('active');
        scoreModal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
        document.documentElement.classList.remove('modal-open');
        // 延迟清空，等淡出动画结束
        setTimeout(() => { scoreModalImg.src = ''; }, 400);
        if (scorePrevFocus instanceof HTMLElement) {
            scorePrevFocus.focus();
            scorePrevFocus = null;
        }
    };

    scorePages.forEach(page => {
        page.setAttribute('role', 'button');
        page.setAttribute('tabindex', '0');
        const open = () => openScoreModal(page.getAttribute('data-full'), page);
        page.addEventListener('click', open);
        page.addEventListener('keydown', (event) => activateOnEnterOrSpace(event, open));
    });

    scoreCloseBtn.addEventListener('click', closeScoreModal);
    scoreOverlay.addEventListener('click', closeScoreModal);
    scorePrevBtn.addEventListener('click', (event) => { event.stopPropagation(); goScorePage(-1); });
    scoreNextBtn.addEventListener('click', (event) => { event.stopPropagation(); goScorePage(1); });
    document.addEventListener('keydown', (event) => {
        if (!scoreModal.classList.contains('active')) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            closeScoreModal();
        } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            goScorePage(-1);
        } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            goScorePage(1);
        }
    });
    // 触摸滑动翻页（手机）
    scoreModalImg.addEventListener('touchstart', (event) => {
        scoreTouchStartX = event.touches[0].clientX;
    }, { passive: true });
    scoreModalImg.addEventListener('touchend', (event) => {
        if (scoreTouchStartX == null) return;
        const deltaX = event.changedTouches[0].clientX - scoreTouchStartX;
        scoreTouchStartX = null;
        if (Math.abs(deltaX) > 48) {
            goScorePage(deltaX > 0 ? -1 : 1);
        }
    }, { passive: true });
