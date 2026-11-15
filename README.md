# SENJA — Perebutan Dermaga

Game FPS taktis round-based di three.js: dua tim, ronde pendek, objective
tanam/jinakkan perangkat, ekonomi antar ronde, dan tembakan yang menghargai
akurasi. Satu pemain melawan bot, di peta dermaga saat senja yang orisinal.

## Cara main

Jalankan server lokal lalu buka di Chrome desktop:

```sh
node serve.ts
# buka http://localhost:8080
```

Klik untuk bermain (pointer lock). Kamu bermain sebagai **Penjaga** bersama
dua bot sekutu melawan tiga bot **Penyerbu**.

## Kontrol

| Tombol | Aksi |
| --- | --- |
| W A S D | Bergerak |
| Mouse | Membidik |
| Klik kiri | Menembak |
| R | Isi ulang |
| 1 / 2 / 3 | Senapan / pistol / granat |
| Q | Ganti senjata cepat |
| G | Lempar granat |
| B | Menu beli (saat fase beli) |
| E (tahan) | Jinakkan perangkat |
| Ctrl / C | Jongkok |
| Spasi | Lompat |
| Shift | Jalan pelan (membidik lebih akurat) |

## Aturan ronde

- Ronde berlangsung 100 detik. Penyerbu menang bila menghabisi Penjaga atau
  perangkat yang ditanam meledak; Penjaga menang bila menghabisi Penyerbu,
  menjinakkan perangkat, atau waktu habis sebelum perangkat ditanam.
- Penyerbu membawa perangkat ke Situs A atau Situs B dan menanamnya (4 detik).
  Setelah tertanam, perangkat meledak dalam 35 detik kecuali dijinakkan
  (tahan E selama 5 detik di dekatnya).
- Uang awal $800. Bunuh +$300, ronde menang +$1400, ronde kalah +$900,
  menanam perangkat +$300 untuk tim. Belanja di fase beli 12 detik awal ronde.
- Pertandingan: tim pertama yang menang 5 ronde.

## Struktur kode

Semua kode game ada di `game/src/`, satu modul satu tugas, dengan simulasi
langkah-tetap 60 Hz yang terpisah dari render:

- `config.js` — senjata, ekonomi, dan semua angka tuning.
- `state.js` — satu tempat penyimpanan state simulasi.
- `world.js` — peta dermaga, collider, waypoint bot, dan pencahayaan.
- `player.js` — gerakan pemain, tabrakan, dan kamera.
- `weapons.js` — senjata pemain, viewmodel, sebaran, dan recoil.
- `bots.js` — AI bot: rute waypoint, persepsi, tempur, dan objective.
- `combat.js` — tembakan hitscan, granat, damage, dan kematian.
- `rounds.js` — mesin state ronde, ekonomi, dan menu beli.
- `effects.js` — tracer, percikan, ledakan (semua pooled, tanpa alokasi per frame).
- `audio.js` — efek suara prosedural WebAudio, tanpa file suara.
- `hud.js` / `minimap.js` — HUD DOM dan minimap.
- `input.js` — keyboard, mouse, dan pointer lock.
- `shot.js` — staging deterministik untuk screenshot (`?shot=...&seed=...`).

`main.ts` di root menyerahkan game: menyalin `game/` dan `screenshots/` ke
output dan menulis `dossier.json` dengan library kit. `vendor/` berisi salinan
kit yang tidak diubah, dan `game/vendor/three/` berisi three.js 0.187.0
byte-exact dari kit.

## Screenshot

Empat screenshot di `screenshots/` adalah render asli game ini di browser
headless lokal, diambil lewat mode `?shot=` yang memakai sistem game yang
sama persis (ronde, bot, dan HUD yang nyata), bukan gambar editan:

- `1-action.jpg` — pertarungan di tengah peta.
- `2-start.jpg` — layar judul di depan pemandangan dermaga.
- `3-buy.jpg` — menu beli di fase beli.
- `4-end.jpg` — layar akhir ronde.

## Lisensi

MIT — lihat `LICENSE`.
