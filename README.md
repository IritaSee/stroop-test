# Stroop Test Monorepo (Vercel + FastAPI + Supabase)

Monorepo ini memisahkan frontend Stroop Test dan backend API agar hasil tersimpan terpusat di Supabase.

## Kenapa FastAPI untuk backend Vercel?

Vercel mendukung Python Serverless Function lewat runtime `@vercel/python`, dan FastAPI cocok karena:
- ringan dan cepat untuk endpoint JSON
- validasi request bawaan (Pydantic)
- mudah dipakai untuk API hasil eksperimen

## Struktur

- `frontend/` UI dan logic Stroop test
- `backend/api/index.py` FastAPI endpoints
- `backend/db/schema.sql` schema tabel Supabase
- `docs/` referensi materi penelitian
- `vercel.json` routing monorepo untuk frontend + API

## Endpoint API

- `GET /api/health` cek status service
- `POST /api/results` simpan hasil 1 sesi tes
- `GET /api/results?participant_id=P01&limit=50` lihat hasil (opsional filter)

## Setup Supabase

1. Buat project Supabase.
2. Buka SQL Editor, jalankan isi file `backend/db/schema.sql`.
3. Ambil:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

## Setup Environment

1. Salin `.env.example` menjadi `.env`.
2. Isi nilai environment variable.

## Jalankan Lokal (opsional)

Frontend bisa dibuka dari `frontend/index.html`.

Untuk backend lokal dengan uvicorn:

```bash
pip install -r requirements.txt
uvicorn backend.api.index:app --reload
```

Lalu akses API di `http://127.0.0.1:8000/api/health`.

## Deploy ke Vercel

1. Import repo ini ke Vercel.
2. Pastikan `vercel.json` dipakai (otomatis).
3. Tambahkan Environment Variables di Project Settings:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ALLOWED_ORIGINS` (pisahkan dengan koma, contoh domain produksi + localhost)
   - `ALLOWED_ORIGIN_REGEX` (opsional, disarankan: `^https://.*\\.vercel\\.app$` untuk preview deployment)
4. Deploy.

Root domain akan menyajikan `frontend/index.html`, sedangkan `/api/*` diarahkan ke FastAPI serverless.

## Cegah masalah CORS di deployment

- Gunakan kombinasi `ALLOWED_ORIGINS` dan `ALLOWED_ORIGIN_REGEX` agar domain preview Vercel juga lolos preflight.
- Hindari trailing slash pada origin (mis. gunakan `https://app.example.com`, bukan `https://app.example.com/`).
- Frontend sudah memanggil API dengan path relatif `/api`, jadi pada domain yang sama biasanya tidak terkena CORS.
- Jika masih muncul `500`, itu biasanya bukan CORS melainkan konfigurasi Supabase (URL/key/table) di backend.

## Diagnosa Error 500 (backend atau database)

Gunakan endpoint berikut di domain deployment:

- `GET /api/health` memastikan FastAPI berjalan.
- `GET /api/health/db` memastikan koneksi Supabase + query ke tabel `stroop_results` berhasil.

Jika `health` sukses tetapi `health/db` gagal, cek:

- `SUPABASE_URL` benar dan aktif.
- `SUPABASE_SERVICE_ROLE_KEY` benar (bukan anon key).
- SQL schema di `backend/db/schema.sql` sudah dijalankan di project Supabase yang sama.
- Environment Variables sudah di-set pada environment Vercel yang benar (Production/Preview).

## Catatan UX/Aksesibilitas yang sudah ditingkatkan

- layout responsif desktop/mobile
- skip link dan focus outline yang jelas
- target tombol lebih besar untuk sentuhan
- live region untuk stimulus/status
- shortcut keyboard (`1`-`4`) untuk respon cepat

Logika pengujian inti tetap dipertahankan:
- latihan 6 trial
- tes utama 36 trial
- komposisi congruent/incongruent/neutral tetap seimbang
- interference score = RT incongruent - RT congruent
