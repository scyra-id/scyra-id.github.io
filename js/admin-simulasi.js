document.addEventListener('DOMContentLoaded', () => {
    
    // 1. SATPAM ADMIN
    const checkAdmin = async () => {
        if (!window.db) return setTimeout(checkAdmin, 100);
        
        const { data: { user } } = await window.db.auth.getUser();
        if (!user) return window.location.href = 'login.html';
        
        const { data: profile } = await window.db.from('profiles').select('role').eq('id', user.id).single();
        if (!profile || profile.role !== 'admin') {
            await showScyraAlert('Halaman ini khusus untuk Admin Scyra.', '⛔ Akses Ditolak', '🔒');
            return window.location.href = 'index.html';
        }
        
        initPage();
    };
    checkAdmin();

    function initPage() {
        setupForm();
        loadDaftarSimulasi();
    }

    // 2. LOGIKA UI FORM & UPLOAD
    function setupForm() {
        const tipeSelect = document.getElementById('tipeSimulasi');
        
        const groupUpload = document.getElementById('groupUpload');
        const fileSimulasi = document.getElementById('fileSimulasi');
        
        const groupLink = document.getElementById('groupLink');
        const linkSimulasi = document.getElementById('linkSimulasi');
        
        const form = document.getElementById('formSimulasi');
        const btnSave = document.getElementById('btnSaveSimulasi');

        // Toggle tampilan input Upload vs Link
        tipeSelect.addEventListener('change', (e) => {
            if (e.target.value === 'upload') {
                groupUpload.style.display = 'block';
                groupLink.style.display = 'none';
                fileSimulasi.required = true;
                linkSimulasi.required = false;
            } else {
                groupUpload.style.display = 'none';
                groupLink.style.display = 'block';
                fileSimulasi.required = false;
                linkSimulasi.required = true;
            }
        });

        // Submit & Proses Upload
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            btnSave.disabled = true;
            btnSave.textContent = '⏳ Mengupload & Menyimpan...';

            const judul = document.getElementById('judulSimulasi').value;
            const tipe = tipeSelect.value;
            let finalUrl = '';

            try {
                if (tipe === 'upload') {
                    const file = fileSimulasi.files[0];
                    if (!file) throw new Error("Pilih file HTML terlebih dahulu!");
                    
                    const cleanFileName = file.name.replace(/\s+/g, '-').toLowerCase();
                    const uniqueName = `${Date.now()}_${cleanFileName}`;
                    
                    const { data: uploadData, error: uploadError } = await window.db.storage
                        .from('simulasi') 
                        .upload(uniqueName, file);
                    
                    if (uploadError) throw new Error("Gagal upload file: " + uploadError.message);

                    const { data: urlData } = window.db.storage
                        .from('simulasi')
                        .getPublicUrl(uniqueName);
                    
                    finalUrl = urlData.publicUrl;
                } else {
                    finalUrl = linkSimulasi.value;
                }

                // Rangkai menjadi kode sandi
                const sandi = `[SIMULASI: ${finalUrl}]`;

                // Simpan sejarahnya ke Database
                const { error: dbError } = await window.db.from('simulasi_list').insert({
                    judul: judul,
                    tipe: tipe,
                    path_file: finalUrl,
                    sandi_tag: sandi
                });

                if (dbError) console.warn("Peringatan: Tabel simulasi_list belum ada, tapi upload berhasil.");

                // 🚨 FUNGSI GLOBAL SEMENTARA UNTUK TOMBOL DI DALAM POPUP 🚨
                window.salinDariModal = function() {
                    navigator.clipboard.writeText(sandi).then(() => {
                        const btn = document.getElementById('btnSalinModal');
                        if(btn) {
                            btn.innerHTML = '✅ Tersalin!';
                            btn.style.background = '#2e7d32'; // Warna hijau gelap saat sukses
                        }
                    }).catch(() => alert('Gagal menyalin otomatis.'));
                };

                // 🚨 UPDATE: Bikin Tombol Salin langsung di dalam pesan pop-up 🚨
                const pesanSukses = `
                    <div style="margin-bottom: 1.5rem;">Simulasi berhasil di-upload dan siap digunakan!</div>
                    <button id="btnSalinModal" onclick="salinDariModal()" style="background: var(--brand-primary, #4caf50); color: #fff; border: none; padding: 0.8rem 1.5rem; border-radius: 8px; font-weight: bold; font-size: 0.95rem; cursor: pointer; display: inline-block; box-shadow: 0 4px 15px rgba(0,0,0,0.1); transition: all 0.2s;">
                        📋 Salin Sandi
                    </button>
                `;

                await showScyraAlert(pesanSukses, '✅ Berhasil!', '🎉');
                
                // Reset Form
                form.reset();
                groupUpload.style.display = 'block';
                groupLink.style.display = 'none';
                loadDaftarSimulasi(); 

            } catch (err) {
                console.error(err);
                await showScyraAlert(err.message, '❌ Gagal Mengupload', '⚠️');
            } finally {
                btnSave.disabled = false;
                btnSave.textContent = '🚀 Upload & Generate Kode';
            }
        });

    }

    // 3. LOGIKA TARIK DATA SIMULASI DARI DATABASE
    async function loadDaftarSimulasi() {
        const grid = document.getElementById('simulasiGrid');
        const loading = document.getElementById('loadingSimulasi');
        
        try {
            const { data, error } = await window.db.from('simulasi_list').select('*').order('created_at', { ascending: false });
            
            loading.style.display = 'none';
            grid.style.display = 'grid';

            if (error || !data || data.length === 0) {
                grid.innerHTML = '<p style="grid-column: 1/-1; color: var(--text-secondary);">Belum ada simulasi yang di-upload.</p>';
                return;
            }

            let html = '';
            data.forEach(item => {
                // 🚨 UPDATE: Teks sandi sekarang disembunyikan pakai display:none
                html += `
                    <div class="simulasi-item">
                        <span class="badge-tipe ${item.tipe}">${item.tipe === 'upload' ? '📂 Upload Supabase' : '🌐 Web Eksternal'}</span>
                        <h3>${item.judul}</h3>
                        
                        <!-- Teks disembunyikan, hanya sebagai wadah data -->
                        <span id="sandi-${item.id}" style="display: none;">${item.sandi_tag}</span>
                        
                        <button class="btn-copy" onclick="copySandi('${item.id}')" style="margin-top: 1rem;">
                            📋 Salin Sandi PDF
                        </button>
                    </div>
                `;
            });
            grid.innerHTML = html;

        } catch (err) {
            loading.style.display = 'none';
            grid.style.display = 'block';
            grid.innerHTML = '<p style="color: var(--error);">⚠️ Tabel <strong>simulasi_list</strong> belum dibuat di Database (SQL Editor).</p>';
        }
    }

    // 4. FUNGSI COPY TO CLIPBOARD
    window.copySandi = async function(id) {
        // 🚨 UPDATE: Menggunakan textContent agar bisa membaca teks yang di-hidden (display:none)
        const textToCopy = document.getElementById(`sandi-${id}`).textContent;
        try {
            await navigator.clipboard.writeText(textToCopy);
            await showScyraAlert('Sandi berhasil disalin ke Clipboard!<br><br>Tinggal paste (CTRL+V) ke dalam file Word/PDF materi.', '✅ Tersalin!', '📋');
        } catch (err) {
            await showScyraAlert('Browser memblokir fitur copy otomatis. Silakan periksa izin browser.', '❌ Gagal Menyalin', '⚠️');
        }
    };
});