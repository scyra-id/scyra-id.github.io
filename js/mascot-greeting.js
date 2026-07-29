function initMascotGreeting() {
    const image = document.getElementById('mascotGreetingImage');
    const text = document.getElementById('mascotGreetingText');
    const mood = document.getElementById('mascotGreetingMood');
    const nextButton = document.getElementById('mascotGreetingNext');
    const mascotButton = document.getElementById('mascotGreetingButton');
    if (!image || !text || !mood) return;

    const greetings = [
        {
            mood: 'Kyra menyapa',
            image: 'images/maskot.webp',
            alt: 'Maskot Scyra sedang menyapa',
            lines: [
                'Hai, Pejuang PTN! Gimana kabarmu hari ini?',
                'Senang lihat kamu datang. Siap selangkah lebih dekat ke kampus impian?',
            ],
        },
        {
            mood: 'Kyra ikut senang',
            image: 'images/maskot-senang.webp',
            alt: 'Maskot Scyra sedang senang',
            lines: [
                'Ada kabar baik hari ini? Ceritakan lewat progres belajarmu, yuk!',
                'Sekecil apa pun langkahmu, Kyra bangga kamu tetap berjuang.',
            ],
        },
        {
            mood: 'Kyra membakar semangat',
            image: 'images/maskot-semangat.webp',
            alt: 'Maskot Scyra sedang bersemangat',
            lines: [
                'Semangatmu sudah menyala! Satu materi lagi, kamu pasti bisa.',
                'Jangan takut mulai. Konsisten sedikit demi sedikit itu hebat!',
            ],
        },
        {
            mood: 'Kyra sedang belajar',
            image: 'images/maskot-belajar.webp',
            alt: 'Maskot Scyra sedang membaca buku',
            lines: [
                'Kyra lagi baca juga, nih. Mau belajar bareng?',
                'Yuk, buka satu bab. Paham konsep dulu, baru taklukkan soalnya!',
            ],
        },
        {
            mood: 'Kyra menemani',
            image: 'images/maskot-sedih.webp',
            alt: 'Maskot Scyra sedang sedih',
            lines: [
                'Hari ini terasa berat? Tidak apa-apa, istirahat sebentar dulu.',
                'Nilai latihan bukan penentu akhir. Kita perbaiki pelan-pelan bersama.',
            ],
        },
        {
            mood: 'Kyra mengingatkan istirahat',
            image: 'images/maskot-tidur.webp',
            alt: 'Maskot Scyra sedang tidur',
            lines: [
                'Kalau sudah malam, jangan lupa istirahat ya. Otak juga perlu recharge.',
                'Tidur cukup malam ini, lalu lanjutkan perjuangan dengan energi baru besok!',
            ],
        },
    ];

    const hour = new Date().getHours();
    let index = hour >= 22 || hour < 5 ? 5 : hour >= 5 && hour < 10 ? 0 : Math.floor(Math.random() * 5);
    let lineIndex = 0;

    function typeText(element, fullText, speed = 28) {
        return new Promise((resolve) => {
            element.textContent = '';
            let i = 0;
            function type() {
                if (i < fullText.length) {
                    element.textContent += fullText.charAt(i);
                    i++;
                    setTimeout(type, speed);
                } else {
                    resolve();
                }
            }
            type();
        });
    }

    async function renderGreeting(animate = true) {
        const greeting = greetings[index];
        if (animate) {
            image.classList.remove('mascot-greeting__image--enter');
            void image.offsetWidth;
            image.classList.add('mascot-greeting__image--enter');
        }
        image.src = greeting.image;
        image.alt = greeting.alt;
        mood.textContent = greeting.mood;
        const fullText = greeting.lines[lineIndex % greeting.lines.length];
        await typeText(text, fullText, 30);
    }

    image.addEventListener('error', () => {
        if (!image.src.endsWith('/images/maskot.webp')) image.src = 'images/maskot.webp';
    });

    function nextGreeting() {
        index = (index + 1) % greetings.length;
        lineIndex = 0;
        renderGreeting();
    }

    nextButton?.addEventListener('click', nextGreeting);
    mascotButton?.addEventListener('click', nextGreeting);
    renderGreeting(false);
}
