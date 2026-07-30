/* ============================================================
   PATH OF LIGHT — Game-like Scrollytelling Engine
   Performance-first: the scroll listener is only attached while
   the section is visible, style writes are deduplicated, and all
   motion runs on compositor-friendly transform/opacity.
   ============================================================ */
(function () {
    'use strict';

    const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const TYPEWRITER_TEXT = 'Hai, Pejuang PTN! Aku sudah menyiapkan sebuah perjalanan untukmu. Siap menemukan seberapa jauh kemampuanmu bisa bertumbuh?';
    const KYRA_POSITIONS = ['hidden', 'center', 'corner', 'gone'];
    const MYTH_DELAY_MS = 650;      // delay before a silhouette materializes
    const FACT_RATIO = 0.62;        // scroll depth that triggers the fact card

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    // Shared handle so the climax can retire Kyra from initHope
    let kyraControl = null;

    document.addEventListener('DOMContentLoaded', () => {
        const section = document.getElementById('path-of-light-section');
        if (!section) return;

        kyraControl = initCompanion(section);
        initTypewriter(section);
        initReveals(section);
        initIllusions(section);
        initPillars(section);
        initWisps(section);
        initScrollEngine(section);
        initHope(section);

        window.pathOfLightLoaded = true;
    });

    /* ============================================================
       KYRA — fixed companion, zone anchors, and the chat bubble.
       Position: center for the intro, then bottom-left corner for
       the rest of the journey. Chat typing is interruptible: a new
       zone instantly kills the previous message's typing loop.
       ============================================================ */
    function initCompanion(section) {
        const companion = document.getElementById('pol-companion');
        const chat = document.getElementById('pol-chat');
        const chatText = document.getElementById('pol-chat-text');
        if (!companion) return null;

        let currentZone = null;
        let chatToken = 0;
        let chatTimer = null;

        const setPosition = (pos) => {
            KYRA_POSITIONS.forEach((p) => companion.classList.remove('kx-' + p));
            companion.classList.add('kx-' + pos);
        };

        const typeChat = (line) => {
            if (!chat || !chatText) return;

            // INTERRUPT: invalidate any in-flight typing immediately
            chatToken += 1;
            const token = chatToken;
            if (chatTimer) {
                clearTimeout(chatTimer);
                chatTimer = null;
            }

            if (!line) {
                chat.classList.remove('open');
                chatText.textContent = '';
                return;
            }

            chat.classList.add('open');

            if (REDUCED_MOTION) {
                chatText.textContent = line;
                return;
            }

            chatText.textContent = '';
            let index = 0;
            const tick = () => {
                if (token !== chatToken) return; // a newer message took over
                index += 1;
                chatText.textContent = line.slice(0, index);
                if (index < line.length) {
                    const char = line[index - 1];
                    const pause = char === '.' || char === '!' || char === '?' ? 260 : char === ',' ? 120 : 0;
                    chatTimer = setTimeout(tick, 26 + pause);
                }
            };
            tick();
        };

        const applyZone = (level) => {
            const pos = level.dataset.kyraPos;
            const line = level.dataset.kyraLine || '';
            if (pos !== currentZone) {
                currentZone = pos;
                setPosition(pos);
            }
            typeChat(line);
        };

        // Visible only while the journey is on screen
        const sectionObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                companion.classList.toggle('pol-on', entry.isIntersecting);
                section.classList.toggle('pol-inview', entry.isIntersecting);
            });
        }, { threshold: 0 });
        sectionObserver.observe(section);

        // The level crossing the viewport's middle band owns Kyra
        const levels = section.querySelectorAll('[data-kyra-pos]');
        const levelObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    applyZone(entry.target);
                }
            });
        }, { threshold: 0, rootMargin: '-40% 0px -40% 0px' });
        levels.forEach((level) => levelObserver.observe(level));

        setPosition('hidden');

        return {
            retire() {
                currentZone = 'gone';
                setPosition('gone');
                typeChat('');
            }
        };
    }

    /* ============================================================
       LEVEL 1 — Typewriter NPC dialogue
       ============================================================ */
    function initTypewriter(section) {
        const target = document.getElementById('pol-typewriter-text');
        const level1 = section.querySelector('.pol-level-1');
        if (!target || !level1) return;

        let started = false;

        const start = () => {
            if (started) return;
            started = true;

            if (REDUCED_MOTION) {
                target.textContent = TYPEWRITER_TEXT;
                return;
            }

            let index = 0;
            const tick = () => {
                index += 1;
                target.textContent = TYPEWRITER_TEXT.slice(0, index);
                if (index < TYPEWRITER_TEXT.length) {
                    const char = TYPEWRITER_TEXT[index - 1];
                    const pause = char === '.' || char === '?' ? 340 : char === ',' ? 160 : 0;
                    setTimeout(tick, 34 + pause + Math.random() * 40);
                }
            };
            tick();
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    start();
                    observer.disconnect();
                }
            });
        }, { threshold: 0.35 });
        observer.observe(level1);
    }

    /* ============================================================
       GENERIC REVEALS — fade-in + slide-up
       ============================================================ */
    function initReveals(section) {
        const elements = section.querySelectorAll('.pol-reveal');
        if (!elements.length) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('pol-visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.2, rootMargin: '0px 0px -8% 0px' });

        elements.forEach((el) => observer.observe(el));
    }

    /* ============================================================
       LEVEL 2 — 2D Cinematic Theme Morphing + Particle System
       Scroll-based reversible state manager: myth/fact transitions
       trigger only when element reaches top 30% of viewport, and
       revert smoothly when user scrolls back up. Scroll velocity
       controls 2D particle motion.
       ============================================================ */
    function initIllusions(section) {
        const level2 = section.querySelector('.pol-level-2');
        const illusions = section.querySelectorAll('.pol-illusion');
        const canvas = level2?.querySelector('.pol-l2-particles');
        const backdrop = level2?.querySelector('.pol-l2-backdrop');
        
        if (!illusions.length || !level2) return;

        let particles = [];
        let ctx = null;
        let isCanvasActive = false;
        let lastScrollY = 0;
        let scrollVelocity = 0;
        let animationFrame = null;

        // Initialize 2D particle system
        if (canvas && !REDUCED_MOTION) {
            ctx = canvas.getContext('2d');
            setupParticles();
            startParticleSystem();
        }

        // Reversible scroll-based state manager + backdrop visibility
        let isLevel2Visible = false;
        let scrollTicking = false;

        function updateIllusionStates() {
            scrollTicking = false;

            // Backdrop: toggle visibility based on Level 2 presence
            if (backdrop) {
                backdrop.classList.toggle('l2-visible', isLevel2Visible);
                // Clip the fixed backdrop to Level 2's vertical bounds
                if (isLevel2Visible) {
                    const vh = window.innerHeight;
                    const r2 = level2.getBoundingClientRect();
                    const topPct = Math.max(0, (r2.top / vh) * 100);
                    const bottomPct = Math.max(0, ((vh - r2.bottom) / vh) * 100);
                    backdrop.style.clipPath = `inset(${topPct.toFixed(1)}% 0% ${bottomPct.toFixed(1)}% 0%)`;
                    backdrop.style.webkitClipPath = `inset(${topPct.toFixed(1)}% 0% ${bottomPct.toFixed(1)}% 0%)`;
                    
                    // Fade out backdrop opacity as Level 2 exits the bottom of the viewport
                    // This prevents the sharp clip cutoff at the transition boundary
                    const fadeZoneHeight = vh * 0.4; // Start fading when Level 2 bottom is 40vh from viewport bottom
                    const distanceFromBottom = r2.bottom - vh;
                    let exitOpacity = 1;
                    
                    if (distanceFromBottom < 0) {
                        // Level 2 is exiting the viewport from the bottom
                        const fadeProgress = Math.min(1, Math.abs(distanceFromBottom) / fadeZoneHeight);
                        exitOpacity = 1 - fadeProgress;
                    } else if (r2.top > 0) {
                        // Level 2 is entering the viewport from the bottom
                        const enterProgress = Math.min(1, (vh - r2.top) / fadeZoneHeight);
                        exitOpacity = enterProgress;
                    }
                    
                    backdrop.style.opacity = exitOpacity.toFixed(2);
                } else {
                    backdrop.style.clipPath = 'inset(100% 0% 0% 0%)';
                    backdrop.style.webkitClipPath = 'inset(100% 0% 0% 0%)';
                    backdrop.style.opacity = '0';
                }
            }

            if (!isLevel2Visible) return;

            const vh = window.innerHeight;
            const triggerLine = vh * 0.3; // Fact triggers at top 30% of viewport
            let anyDispelled = false;

            illusions.forEach((el) => {
                const rect = el.getBoundingClientRect();
                const isVisible = rect.bottom > 0 && rect.top < vh;
                const inTriggerZone = rect.top >= 0 && rect.top < triggerLine && rect.bottom > 0;

                // Myth-in: silhouette materializes when element enters viewport (with delay)
                if (isVisible && !el.classList.contains('myth-in') && !el._mythTimer) {
                    el._mythTimer = setTimeout(() => {
                        el.classList.add('myth-in');
                        el._mythTimer = null;
                    }, REDUCED_MOTION ? 0 : MYTH_DELAY_MS);
                } else if (!isVisible && el.classList.contains('myth-in') && !el.classList.contains('dispelled')) {
                    // Revert: element left viewport without being dispelled
                    if (el._mythTimer) {
                        clearTimeout(el._mythTimer);
                        el._mythTimer = null;
                    }
                    el.classList.remove('myth-in');
                }

                // Dispelled: fact card appears when element reaches top 30% of viewport
                if (inTriggerZone) {
                    if (!el.classList.contains('dispelled')) {
                        // Ensure myth-in is active before dispelling
                        el.classList.add('myth-in', 'dispelled');
                        if (el._mythTimer) {
                            clearTimeout(el._mythTimer);
                            el._mythTimer = null;
                        }
                    }
                    anyDispelled = true;
                } else if (el.classList.contains('dispelled') && rect.top > triggerLine) {
                    // Reversible: user scrolled up, element moved below trigger line
                    el.classList.remove('dispelled');
                }
                // If rect.top < 0 (element scrolled past to above viewport), keep dispelled ON
            });

            // Toggle global fact-mode for backdrop theme morphing
            level2.classList.toggle('fact-mode', anyDispelled);
        }

        function requestScrollUpdate() {
            if (!scrollTicking) {
                scrollTicking = true;
                window.requestAnimationFrame(updateIllusionStates);
            }
        }

        // Only listen to scroll events while Level 2 is visible (performance)
        // Use rootMargin to trigger backdrop slightly before Level 2 enters viewport
        const gateObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                isLevel2Visible = entry.isIntersecting;
                if (isLevel2Visible) {
                    window.addEventListener('scroll', requestScrollUpdate, { passive: true });
                    window.addEventListener('resize', requestScrollUpdate);
                    updateIllusionStates(); // Initial check
                } else {
                    window.removeEventListener('scroll', requestScrollUpdate);
                    window.removeEventListener('resize', requestScrollUpdate);
                    // Fade out backdrop smoothly when Level 2 leaves viewport
                    if (backdrop) {
                        backdrop.classList.remove('l2-visible');
                        backdrop.style.clipPath = 'inset(100% 0% 0% 0%)';
                        backdrop.style.webkitClipPath = 'inset(100% 0% 0% 0%)';
                    }
                }
            });
        }, { threshold: 0, rootMargin: '10% 0px 0px 0px' });
        gateObserver.observe(level2);

        // Scroll velocity tracking for particles
        function trackScrollVelocity() {
            const currentScrollY = window.scrollY;
            scrollVelocity = currentScrollY - lastScrollY;
            lastScrollY = currentScrollY;
        }

        // Setup particle system
        function setupParticles() {
            if (!canvas || !ctx) return;
            
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width * (window.devicePixelRatio || 1);
            canvas.height = rect.height * (window.devicePixelRatio || 1);
            ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

            particles = [];
            const PARTICLE_COUNT = 24;

            for (let i = 0; i < PARTICLE_COUNT; i++) {
                particles.push({
                    x: Math.random() * rect.width,
                    y: Math.random() * rect.height,
                    baseVx: (Math.random() - 0.5) * 0.4,
                    baseVy: -0.3 - Math.random() * 0.6,
                    vx: 0,
                    vy: 0,
                    size: 1 + Math.random() * 2,
                    opacity: 0.3 + Math.random() * 0.4,
                    hue: 200 + Math.random() * 60,
                    twinkle: Math.random() * Math.PI * 2,
                    life: 0.5 + Math.random() * 0.5
                });
            }
        }

        // Start particle animation loop
        function startParticleSystem() {
            if (!ctx || REDUCED_MOTION) return;

            function animate() {
                if (!isCanvasActive) {
                    animationFrame = null;
                    return;
                }

                const rect = canvas.getBoundingClientRect();
                ctx.clearRect(0, 0, rect.width, rect.height);

                trackScrollVelocity();

                particles.forEach((p) => {
                    const velocityMultiplier = 1 + Math.abs(scrollVelocity) * 0.03;
                    const stretch = Math.min(Math.abs(scrollVelocity) * 0.1, 0.8);

                    p.vx = p.baseVx + scrollVelocity * 0.02;
                    p.vy = p.baseVy * velocityMultiplier;

                    p.x += p.vx;
                    p.y += p.vy;
                    p.twinkle += 0.05;

                    if (p.x < -10) p.x = rect.width + 10;
                    if (p.x > rect.width + 10) p.x = -10;
                    if (p.y < -10) p.y = rect.height + 10;
                    if (p.y > rect.height + 10) p.y = -10;

                    const isFactMode = level2.classList.contains('fact-mode');
                    const baseHue = isFactMode ? 170 + Math.sin(p.twinkle) * 20 : 220 + Math.sin(p.twinkle) * 15;
                    const saturation = isFactMode ? 60 : 40;
                    const lightness = isFactMode ? 70 : 50;

                    const alpha = p.opacity * p.life * (0.7 + 0.3 * Math.sin(p.twinkle));
                    ctx.globalAlpha = Math.max(alpha, 0);
                    
                    ctx.fillStyle = `hsl(${baseHue}, ${saturation}%, ${lightness}%)`;
                    ctx.shadowColor = ctx.fillStyle;
                    ctx.shadowBlur = 8 + stretch * 4;

                    ctx.beginPath();
                    if (stretch > 0.2) {
                        const stretchLength = 2 + stretch * 6;
                        ctx.ellipse(p.x, p.y, p.size, p.size + stretchLength, Math.PI * 0.5, 0, Math.PI * 2);
                    } else {
                        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    }
                    ctx.fill();
                });

                ctx.globalAlpha = 1;
                ctx.shadowBlur = 0;
                animationFrame = requestAnimationFrame(animate);
            }

            animationFrame = requestAnimationFrame(animate);
        }

        // Canvas visibility observer
        if (canvas) {
            const canvasObserver = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    isCanvasActive = entry.isIntersecting;
                    if (isCanvasActive && !animationFrame && !REDUCED_MOTION) {
                        startParticleSystem();
                    }
                });
            }, { threshold: 0 });
            canvasObserver.observe(level2);

            window.addEventListener('resize', () => {
                if (isCanvasActive && ctx) {
                    setupParticles();
                }
            });
        }
    }

    /* ============================================================
       LEVEL 3 — Pillars unlock + tap-to-toggle tooltips (touch)
       ============================================================ */
    function initPillars(section) {
        const pillars = section.querySelectorAll('.pol-pillar');
        if (!pillars.length) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('lit');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.5 });

        pillars.forEach((pillar) => {
            observer.observe(pillar);
            pillar.addEventListener('click', () => {
                const wasOn = pillar.classList.contains('tip-on');
                pillars.forEach((p) => p.classList.remove('tip-on'));
                pillar.classList.toggle('tip-on', !wasOn);
            });
        });

        document.addEventListener('click', (event) => {
            if (!event.target.closest('.pol-pillar')) {
                pillars.forEach((p) => p.classList.remove('tip-on'));
            }
        });
    }

    /* ============================================================
       LEVEL 4 — Wisps: tap-to-toggle bestiary cards (touch)
       ============================================================ */
    function initWisps(section) {
        const wisps = section.querySelectorAll('.pol-wisp');
        if (!wisps.length) return;

        wisps.forEach((wisp) => {
            wisp.addEventListener('click', () => {
                const wasOn = wisp.classList.contains('tip-on');
                wisps.forEach((w) => w.classList.remove('tip-on'));
                wisp.classList.toggle('tip-on', !wasOn);
            });
        });

        document.addEventListener('click', (event) => {
            if (!event.target.closest('.pol-wisp')) {
                wisps.forEach((w) => w.classList.remove('tip-on'));
            }
        });
    }

    /* ============================================================
       SCROLL ENGINE — rAF-throttled, and ONLY active while the
       section intersects the viewport. Style writes are skipped
       when the rounded value hasn't changed (no layout thrash).
       ============================================================ */
    function initScrollEngine(section) {
        if (REDUCED_MOTION) return;

        const level0 = section.querySelector('.pol-level-0');
        const level1 = section.querySelector('.pol-level-1');
        const fogs = level1 ? level1.querySelectorAll('.pol-fog') : [];
        const parallaxLayers = section.querySelectorAll('[data-speed]');

        // Cache of last-written values to avoid useless style recalcs
        const cache = { veil: -1, efog: -1, fog: -1 };
        let listening = false;
        let ticking = false;

        const setVar = (el, name, value, cacheKey) => {
            const rounded = Math.round(value * 250);
            if (cache[cacheKey] === rounded) return;
            cache[cacheKey] = rounded;
            el.style.setProperty(name, (rounded / 250).toFixed(3));
        };

        const update = () => {
            ticking = false;
            const viewportH = window.innerHeight;

            // Level 0: veil dissolves, fog thickens then settles
            if (level0) {
                const r0 = level0.getBoundingClientRect();
                if (r0.bottom > 0 && r0.top < viewportH) {
                    const p0 = clamp(-r0.top / (r0.height * 0.75), 0, 1);
                    const fogCurve = p0 < 0.5 ? p0 * 2 : (1 - p0) * 2;
                    setVar(level0, '--veil', 1 - p0, 'veil');
                    setVar(level0, '--efog', fogCurve, 'efog');
                    level0.style.setProperty('--cap', fogCurve.toFixed(3));
                }
            }

            // Level 1: mist clears as the quest is accepted
            if (level1) {
                const r1 = level1.getBoundingClientRect();
                if (r1.bottom > 0 && r1.top < viewportH) {
                    const fogProgress = clamp(-r1.top / (r1.height * 0.6), 0, 1);
                    fogs.forEach((fog) => setVar(fog, '--fog-opacity', 1 - fogProgress, 'fog'));
                }
            }

            // Parallax: distant forest lags behind the scroll
            parallaxLayers.forEach((layer) => {
                const host = layer.parentElement.getBoundingClientRect();
                if (host.bottom < 0 || host.top > viewportH) return;
                const speed = parseFloat(layer.dataset.speed) || 0.2;
                const offset = (viewportH / 2 - host.top - host.height / 2) * speed;
                layer.style.transform = 'translate3d(0, ' + offset.toFixed(1) + 'px, 0)';
            });
        };

        const requestUpdate = () => {
            if (!ticking) {
                ticking = true;
                window.requestAnimationFrame(update);
            }
        };

        const start = () => {
            if (listening) return;
            listening = true;
            window.addEventListener('scroll', requestUpdate, { passive: true });
            window.addEventListener('resize', requestUpdate);
            update();
        };

        const stop = () => {
            if (!listening) return;
            listening = false;
            window.removeEventListener('scroll', requestUpdate);
            window.removeEventListener('resize', requestUpdate);
        };

        // Attach/detach the listener with section visibility
        const gate = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) start(); else stop();
            });
        }, { threshold: 0 });
        gate.observe(section);
    }

    /* ============================================================
       LEVEL 7 — Climax: destiny form → starburst → dynamic store
       ============================================================ */
    function initHope(section) {
        const form = document.getElementById('pol-hope-form');
        const parchment = document.getElementById('pol-parchment');
        const peak = section.querySelector('.pol-level-7');
        const destiny = document.getElementById('pol-destiny');
        const greeting = document.getElementById('pol-destiny-greeting');
        if (!form || !parchment || !peak || !destiny) return;

        let launched = false;

        form.addEventListener('submit', (event) => {
            event.preventDefault();
            if (launched) return;
            launched = true;

            const nameInput = form.elements.hopeName;
            const hopeInput = form.elements.hopeText;
            const name = (nameInput && nameInput.value.trim()) || 'Pejuang';
            const hope = hopeInput ? hopeInput.value.trim() : '';

            const button = form.querySelector('button[type="submit"]');
            if (button) button.disabled = true;

            lockScroll();

            // Kyra's fixed companionship ends — she ascends to watch
            if (kyraControl) kyraControl.retire();

            const rect = parchment.getBoundingClientRect();
            const burstX = rect.left + rect.width / 2;
            const burstY = Math.max(rect.top - window.innerHeight * 0.42, 60);

            parchment.classList.add('pol-fly');

            const FLIGHT_MS = REDUCED_MOTION ? 0 : 950;
            const BURST_MS = REDUCED_MOTION ? 0 : 1900;

            setTimeout(() => {
                parchment.style.visibility = 'hidden';
                if (!REDUCED_MOTION) {
                    runStarburst(burstX, burstY);
                }

                setTimeout(() => {
                    revealDestiny(peak, destiny, greeting, name, hope);
                    unlockScroll();
                    destiny.scrollIntoView({ behavior: REDUCED_MOTION ? 'auto' : 'smooth', block: 'center' });
                    loadStoreInventory();
                }, BURST_MS * 0.55);
            }, FLIGHT_MS);
        });
    }

    function revealDestiny(peak, destiny, greeting, name, hope) {
        if (greeting) {
            const header = destiny.querySelector('.pol-surat-header');
            if (header) {
                header.textContent = '✦ Untuk ' + name;
            }

            greeting.innerHTML = '';
            const para = document.createElement('p');
            para.style.margin = '0 0 0.5rem';
            para.textContent = 'Hari ini, kamu menuliskan sebuah impian:';
            greeting.append(para);

            const hopeLine = hope ? ' "' + hope + '"' : '';
            const hopeP = document.createElement('p');
            hopeP.style.cssText = 'font-size: 1.3rem; font-weight: 700; color: var(--pol-gold); margin: 0.5rem 0 0.8rem;';
            hopeP.textContent = hopeLine;
            greeting.append(hopeP);

            const closeP = document.createElement('p');
            closeP.style.margin = '0.5rem 0 0';
            closeP.textContent = 'Semoga suatu hari nanti, kamu melihat kembali tulisan ini dengan senyum penuh rasa syukur. Teruslah belajar, berdoa, dan bertumbuh sedikit demi sedikit.';
            greeting.append(closeP);
        }

        peak.classList.add('destiny-revealed');
        destiny.hidden = false;

        const downloadBtn = document.getElementById('pol-download-surat');
        const suratEl = destiny.querySelector('.pol-destiny-surat');
        if (downloadBtn && suratEl) {
            downloadBtn.addEventListener('click', () => {
                downloadSurat(suratEl, name);
            });
        }
    }

    function downloadSurat(suratEl, name) {
        const overlay = document.createElement('div');
        overlay.className = 'pol-download-overlay';
        overlay.innerHTML = '<p>Menyiapkan suratmu... ✦</p>';
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('active'));

        const tempWrapper = document.createElement('div');
        tempWrapper.style.cssText = 'position:fixed; left:-9999px; top:0; width:600px;';
        document.body.appendChild(tempWrapper);

        const clone = suratEl.cloneNode(true);
        const downloadBtnClone = clone.querySelector('#pol-download-surat');
        if (downloadBtnClone) downloadBtnClone.remove();
        tempWrapper.appendChild(clone);

        html2canvas(clone, {
            backgroundColor: '#04060e',
            scale: 2,
            useCORS: true,
            logging: false
        }).then((canvas) => {
            const fileName = (name || 'Pejuang').replace(/[^a-zA-Z0-9]/g, '_');
            const link = document.createElement('a');
            link.download = 'Surat_Harapan_Scyra_' + fileName + '.png';
            link.href = canvas.toDataURL('image/png');
            link.click();

            tempWrapper.remove();
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 400);
        }).catch((err) => {
            console.error('Download gagal:', err);
            tempWrapper.remove();
            overlay.remove();
        });
    }

    /* ============================================================
       DYNAMIC STORE — fetch paketbelajar.html, extract the live
       pricing grid via DOMParser, and inject it.
       ============================================================ */
    async function loadStoreInventory() {
        const inventory = document.getElementById('pol-store-inventory');
        const fallback = document.getElementById('pol-store-fallback');
        if (!inventory) return;

        try {
            const response = await fetch('paketbelajar.html', { credentials: 'same-origin' });
            if (!response.ok) throw new Error('HTTP ' + response.status);

            const html = await response.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const grid = doc.querySelector('.paket-grid');
            if (!grid) throw new Error('Pricing grid not found');

            // Strip interactive-only fragments that need paketbelajar.js
            grid.querySelectorAll('.credit-purchase-section').forEach((node) => node.remove());

            const clone = document.importNode(grid, true);
            inventory.appendChild(clone);

            // Buttons carry no JS here — route them to the real store page
            inventory.addEventListener('click', (event) => {
                const btn = event.target.closest('.btn-pilih-paket');
                if (btn && !btn.disabled) {
                    window.location.href = 'paketbelajar.html';
                }
            });

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    inventory.classList.add('unlocked');
                });
            });
        } catch (error) {
            console.warn('Path of Light: dynamic store unavailable —', error.message);
            inventory.remove();
            if (fallback) fallback.hidden = false;
        }
    }

    function lockScroll() {
        document.documentElement.classList.add('pol-no-scroll');
    }

    function unlockScroll() {
        document.documentElement.classList.remove('pol-no-scroll');
    }

    /* ============================================================
       STARBURST — canvas particle explosion
       ============================================================ */
    function runStarburst(x, y) {
        const canvas = document.createElement('canvas');
        canvas.className = 'pol-burst-canvas';
        document.body.appendChild(canvas);

        const ctx = canvas.getContext('2d');
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        ctx.scale(dpr, dpr);

        const PALETTE = ['#fff7e0', '#ffd97a', '#e8a93d', '#8fd8ff', '#8d7bff', '#ffffff'];
        const particles = [];
        const PARTICLE_COUNT = 160;

        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 9;
            particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 2.5,
                radius: 1 + Math.random() * 2.6,
                color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
                life: 1,
                decay: 0.008 + Math.random() * 0.014,
                twinkle: Math.random() * Math.PI * 2
            });
        }

        let flashRadius = 8;
        let flashAlpha = 0.95;

        const start = performance.now();
        const MAX_MS = 2600;

        const frame = (now) => {
            const elapsed = now - start;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            if (flashAlpha > 0.01) {
                const gradient = ctx.createRadialGradient(x, y, 0, x, y, flashRadius);
                gradient.addColorStop(0, 'rgba(255, 247, 224, ' + flashAlpha + ')');
                gradient.addColorStop(0.4, 'rgba(255, 217, 122, ' + flashAlpha * 0.55 + ')');
                gradient.addColorStop(1, 'rgba(255, 217, 122, 0)');
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(x, y, flashRadius, 0, Math.PI * 2);
                ctx.fill();
                flashRadius += 7;
                flashAlpha *= 0.9;
            }

            let alive = 0;
            particles.forEach((p) => {
                if (p.life <= 0) return;
                alive += 1;

                p.vx *= 0.985;
                p.vy = p.vy * 0.985 + 0.09;
                p.x += p.vx;
                p.y += p.vy;
                p.life -= p.decay;
                p.twinkle += 0.25;

                const alpha = clamp(p.life, 0, 1) * (0.55 + 0.45 * Math.sin(p.twinkle));
                ctx.globalAlpha = Math.max(alpha, 0);
                ctx.fillStyle = p.color;
                ctx.shadowColor = p.color;
                ctx.shadowBlur = 12;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;

            if ((alive > 0 || flashAlpha > 0.01) && elapsed < MAX_MS) {
                requestAnimationFrame(frame);
            } else {
                canvas.remove();
            }
        };

        requestAnimationFrame(frame);
    }
})();
