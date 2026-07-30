document.addEventListener('DOMContentLoaded', async () => {
    const waitForDb = () => new Promise((resolve) => {
        if (window.db) {
            resolve();
            return;
        }
        const interval = setInterval(() => {
            if (window.db) {
                clearInterval(interval);
                resolve();
            }
        }, 100);
    });

    await waitForDb();

    const { data: { user } } = await window.db.auth.getUser();
    const guestHeader = document.getElementById('guest-header');
    const guestFooter = document.getElementById('guest-footer');
    const dashboardLayout = document.getElementById('dashboard-layout');
    const pageContent = document.getElementById('page-content');

    if (user) {
        document.body.classList.add('dashboard-page');
        if (guestHeader) guestHeader.style.display = 'none';
        if (guestFooter) guestFooter.style.display = 'none';
        if (dashboardLayout) dashboardLayout.style.display = 'flex';

        const dashboardBody = document.getElementById('dashboard-body-target');
        if (dashboardBody && pageContent) dashboardBody.appendChild(pageContent);
        return;
    }

    document.body.classList.remove('dashboard-page');
    if (dashboardLayout) dashboardLayout.style.display = 'none';

    if (guestHeader) {
        fetch('components/header.html')
            .then((response) => response.text())
            .then((html) => {
                guestHeader.innerHTML = html;
                document.dispatchEvent(new Event('headerLoaded'));
            })
            .catch((error) => console.error('Gagal load header:', error));
    }

    if (guestFooter) {
        fetch('components/footer.html')
            .then((response) => response.text())
            .then((html) => {
                guestFooter.innerHTML = html;
            })
            .catch((error) => console.error('Gagal load footer:', error));
    }
});
