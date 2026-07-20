document.addEventListener('DOMContentLoaded', async () => {
    const checkAuth = async () => {
        if (!window.db) return setTimeout(checkAuth, 100);
        
        const { data: { user } } = await window.db.auth.getUser();
        
        if (!user) {
            await showScyraAlert('Kamu harus login terlebih dahulu untuk mengakses Dashboard.', '⛔ Akses Ditolak', '🔒');
            window.location.href = 'login.html';
            return;
        }
        
        const { data: profile } = await window.db
            .from('profiles')
            .select('full_name')
            .eq('id', user.id)
            .single();
            
        const userName = profile?.full_name || user.email.split('@')[0];
        document.getElementById('dashUserName').textContent = userName;
    };
    
    checkAuth();
});