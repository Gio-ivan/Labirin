# 🏰 Labirin 3D - Eksplorasi Jalan Buntu (D-Pad Controller & Elevated Camera)

Media ajar interaktif 3D berbasis WebGL super mulus (*60 FPS*) untuk aktivitas Sekolah Minggu: **Ilustrasi "Jalan Buntu"**.

---

## ⚡ Fitur & Pembaruan Terbaru

1. **Tombol Gerak D-Pad di Kiri Bawah (Tidak Menghalangi Layar):**
   * Berada rapi di **sudut kiri bawah** dengan tata letak D-Pad (Plus/Cross).
   * Tombol:
     * `▲ LURUS` (Atas)
     * `◀ KIRI` (Kiri)
     * `▶ KANAN` (Kanan)
     * `▼ BALIK` (Bawah / Putar Balik)
     * `🧭` (Kompas arah di tengah)
   * Tombol otomatis menyorot arah lorong yang terbuka dan mati (*disabled*) jika terhalang dinding.
   * Area tengah dan kanan layar kini **bersih dan bebas halangan pandangan**!

2. **Sudut Kamera Lebih Tinggi (*Wall Height Elevated Camera*):**
   * Posisi kamera dinaikkan ke ketinggian **3.85 unit** (setinggi puncak dinding batu labirin).
   * Kamera menunduk menghadap ke arah karakter, memberikan sudut pandang elevated third-person yang luas untuk melihat lorong-lorong dan belokan di sekitar karakter.
   * Kamera **berputar otomatis (*auto-rotate*)** mengikuti arah lari karakter saat berbelok.

3. **Mode LARI Saja (Pure Running):**
   * Karakter selalu bergerak dalam mode **berlari kencang (*run animation*)** dengan efek suara langkah kaki.
   * Berlari lurus secara otomatis di lorong panjang dan berhenti di setiap persimpangan/belokan.

4. **Peta 2D dengan Kabut (*Fog of War*) di Kiri Atas:**
   * Di atas D-Pad (kiri atas) terdapat minimap 2D yang membuka kabut secara *real-time*.

5. **Pintu Keluar Terkunci Rapat (*No Way Out*):**
   * Di ujung labirin, pintu gerbang digembok dan dirantai besi mati. Karakter menggelengkan kepala bingung (`headShake`) dan memicu pesan refleksi jalan buntu.

---

## 📁 Struktur File (100% Mandiri)

```text
labirin-game/
├── index.html            # Halaman utama game
├── style.css             # Desain D-Pad kiri bawah, minimap & modal
├── script.js             # Engine Three.js, kamera elevated & auto-run
├── README.md             # Dokumentasi
└── assets/
    ├── js/
    │   ├── three.min.js     # Library Three.js
    │   └── GLTFLoader.js    # Loader 3D GLTF
    ├── models/
    │   ├── character.glb    # File GLB Mixamo asli
    │   └── character_data.js# Model tertanam (bebas CORS)
    └── sounds/
        ├── footstep.ogg     # Langkah kaki berlari
        ├── door_locked.wav  # Gemerincing rantai pintu terkunci
        ├── blocked.ogg      # Efek jalan buntu
        └── click.wav        # Klik tombol arah
```
