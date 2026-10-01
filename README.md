# Balereot Community

Admin panel dan konfigurasi Script Studio untuk Balereot Community.

## Struktur

- `admin.html` — panel admin untuk mengelola item konfigurasi.
- `config.json` — daftar script/loadstring yang digunakan panel.
- `data/` — tempat file `.lua` yang direferensikan oleh `config.json`.

## Cara menjalankan

Buka `admin.html` melalui hosting/static site yang mengizinkan halaman membaca `config.json` dari folder yang sama.

> Catatan: `admin.html` sendiri tidak mengandung parser/importer RBXM. Jika sistem membutuhkan importer RBXM, file Lua yang melakukan proses tersebut perlu dimasukkan ke folder `data/` dan didaftarkan di `config.json`.
