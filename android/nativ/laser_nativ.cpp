/* Topovo — Laserkacheln nativ entpacken (Stufe 2, 12.11.2026)
 *
 * Dasselbe wie stueckeSchneiden in laser-werk.js, nur als Maschinencode für den Handy-Prozessor
 * statt WebAssembly: die LAZ (von Haupt.java beim Download mitgeschrieben) per mmap lesen, die
 * Chunk-Tabelle mit laz-perf entschlüsseln, die Chunks auf alle Kerne verteilen (laz-perfs
 * chunk_decompressor) und nur die Punkte im Rechteck X0…X1, Y0…Y1 (ganze Zahlen wie im LAS)
 * in Dateireihenfolge in eine Ergebnisdatei schreiben:
 *
 *   16 Byte Kopf: "TPN1", uint32 Fassung (1), uint64 Anzahl
 *   je Punkt 15 Byte: int32 X, int32 Y, int32 Z, uint16 Intensität, uint8 Klasse
 *
 * laser-werk.js (nativSchneiden) gibt die Punkte daraus an nimm — genau wie aus den Hilfs-Workern.
 * laz-perf liegt daneben (lazperf/, Apache 2.0, Fassung 3.4.0 von github.com/hobuinc/laz-perf).
 * Mit -DTOPOVO_PRUEFEN entsteht statt der JNI-Bibliothek ein Prüfprogramm für den PC. */
#include <algorithm>
#include <atomic>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <fcntl.h>
#include <stdexcept>
#include <string>
#include <sys/mman.h>
#include <sys/stat.h>
#include <thread>
#include <unistd.h>
#include <vector>

#include "lazperf/lazperf.hpp"
#include "lazperf/readers.hpp"

namespace {

template <typename T> T lies(const uint8_t *p) { T v; std::memcpy(&v, p, sizeof v); return v; }

struct Datei {
    const uint8_t *d = nullptr;
    size_t n = 0;
    int fd = -1;
    explicit Datei(const char *pfad) {
        fd = open(pfad, O_RDONLY);
        if (fd < 0) throw std::runtime_error("LAZ nicht lesbar");
        struct stat st;
        if (fstat(fd, &st) != 0 || st.st_size < 375) throw std::runtime_error("LAZ zu kurz");
        n = (size_t)st.st_size;
        void *m = mmap(nullptr, n, PROT_READ, MAP_PRIVATE, fd, 0);
        if (m == MAP_FAILED) throw std::runtime_error("mmap fehlgeschlagen");
        d = (const uint8_t *)m;
        madvise(m, n, MADV_SEQUENTIAL);
    }
    ~Datei() { if (d) munmap((void *)d, n); if (fd >= 0) close(fd); }
};

int grundLaenge(int format) {
    switch (format) {
    case 0: return 20; case 1: return 28; case 2: return 26; case 3: return 34;
    case 6: return 30; case 7: return 36; case 8: return 38;
    default: return -1;
    }
}

}  // namespace

/** Gibt die Zahl der geschriebenen Punkte zurück; wirft bei Fehlern. */
static uint64_t schneiden(const char *lazPfad, const char *ausPfad, int32_t X0, int32_t X1, int32_t Y0, int32_t Y1, int faeden) {
    Datei f(lazPfad);
    const uint8_t *b = f.d;
    if (std::memcmp(b, "LASF", 4) != 0) throw std::runtime_error("keine LAS-Datei");
    const uint32_t daten = lies<uint32_t>(b + 96), nVlr = lies<uint32_t>(b + 100);
    const int format = b[104] & 0x3f, laenge = lies<uint16_t>(b + 105);
    uint64_t anzahl = lies<uint32_t>(b + 107);
    if (!anzahl && b[25] >= 4) anzahl = lies<uint64_t>(b + 247);
    const int grund = grundLaenge(format);
    if (grund < 0 || laenge < grund) throw std::runtime_error("Punktformat nicht unterstützt");
    // LASzip-VLR: Chunkgröße
    uint32_t chunkGroesse = 0;
    size_t p = lies<uint16_t>(b + 94);
    for (uint32_t i = 0; i < nVlr && p + 54 <= f.n; i++) {
        const uint16_t len = lies<uint16_t>(b + p + 20);
        if (std::strncmp((const char *)b + p + 2, "laszip encoded", 16) == 0 && lies<uint16_t>(b + p + 18) == 22204 && p + 54 + 16 <= f.n)
            chunkGroesse = lies<uint32_t>(b + p + 54 + 12);
        p += 54 + len;
    }
    if (!chunkGroesse) throw std::runtime_error("keine LASzip-Angaben");
    if ((size_t)daten + 8 > f.n) throw std::runtime_error("LAZ unvollständig");
    int64_t tab = lies<int64_t>(b + daten);
    if (tab == -1) tab = lies<int64_t>(b + f.n - 8);
    if (tab <= (int64_t)daten || (size_t)tab + 8 > f.n) throw std::runtime_error("Chunk-Tabelle fehlt");
    if (lies<uint32_t>(b + tab) != 0) throw std::runtime_error("Chunk-Tabelle unbekannt");
    const uint32_t nChunks = lies<uint32_t>(b + tab + 4);
    const bool variabel = chunkGroesse == 0xffffffffu;
    size_t lesePos = (size_t)tab + 8;
    auto cb = [&](unsigned char *ziel, size_t n) {
        if (lesePos + n > f.n) throw std::runtime_error("Chunk-Tabelle abgeschnitten");
        std::memcpy(ziel, b + lesePos, n);
        lesePos += n;
    };
    std::vector<lazperf::chunk> chunks = lazperf::decompress_chunk_table(cb, nChunks, variabel);
    // Anfang und Punkte je Chunk
    std::vector<uint64_t> start(nChunks), punkte(nChunks);
    uint64_t s = (uint64_t)daten + 8, rest = anzahl;
    for (uint32_t i = 0; i < nChunks; i++) {
        start[i] = s;
        s += chunks[i].offset;          // offset ist hier die Größe des Chunks
        punkte[i] = variabel ? chunks[i].count : std::min<uint64_t>(chunkGroesse, rest);
        rest -= std::min<uint64_t>(rest, punkte[i]);
    }
    if (s != (uint64_t)tab) throw std::runtime_error("Chunk-Tabelle passt nicht");

    FILE *aus = std::fopen(ausPfad, "wb");
    if (!aus) throw std::runtime_error("Ergebnisdatei nicht anlegbar");
    uint8_t kopf[16] = { 'T', 'P', 'N', '1', 1, 0, 0, 0 };
    std::fwrite(kopf, 1, 16, aus);

    const int ebZahl = laenge - grund;
    const size_t kByte = format >= 6 ? 16 : 15;
    const uint8_t kMaske = format >= 6 ? 0xff : 0x1f;
    if (faeden < 1) faeden = 1;
    const uint32_t gruppe = (uint32_t)faeden * 4;        // so viele Chunks je Runde, danach in Reihenfolge schreiben
    std::vector<std::vector<uint8_t>> ergebnis(gruppe);
    std::vector<std::string> fehler(faeden);
    uint64_t geschrieben = 0;
    for (uint32_t c0 = 0; c0 < nChunks; c0 += gruppe) {
        const uint32_t c1 = std::min(nChunks, c0 + gruppe);
        std::atomic<uint32_t> naechster(c0);
        auto arbeit = [&](int nr) {
            try {
                std::vector<char> punkt(laenge);
                for (uint32_t c; (c = naechster.fetch_add(1)) < c1;) {
                    std::vector<uint8_t> &e = ergebnis[c - c0];
                    e.clear();
                    if (start[c] >= f.n) throw std::runtime_error("Chunk außerhalb der Datei");
                    lazperf::reader::chunk_decompressor dec(format, ebZahl, (const char *)b + start[c]);
                    for (uint64_t i = 0; i < punkte[c]; i++) {
                        dec.decompress(punkt.data());
                        const uint8_t *q = (const uint8_t *)punkt.data();
                        const int32_t X = lies<int32_t>(q), Y = lies<int32_t>(q + 4);
                        if (X < X0 || X > X1 || Y < Y0 || Y > Y1) continue;
                        const size_t o = e.size();
                        e.resize(o + 15);
                        std::memcpy(&e[o], q, 12);            // X, Y, Z
                        std::memcpy(&e[o + 12], q + 12, 2);   // Intensität
                        e[o + 14] = q[kByte] & kMaske;
                    }
                }
            } catch (const std::exception &x) { fehler[nr] = x.what(); }
        };
        std::vector<std::thread> t;
        for (int i = 1; i < faeden; i++) t.emplace_back(arbeit, i);
        arbeit(0);
        for (auto &x : t) x.join();
        for (auto &x : fehler) if (!x.empty()) { std::fclose(aus); std::remove(ausPfad); throw std::runtime_error(x); }
        for (uint32_t c = c0; c < c1; c++) {
            auto &e = ergebnis[c - c0];
            if (!e.empty() && std::fwrite(e.data(), 1, e.size(), aus) != e.size()) {
                std::fclose(aus); std::remove(ausPfad); throw std::runtime_error("Schreiben fehlgeschlagen");
            }
            geschrieben += e.size() / 15;
            std::vector<uint8_t>().swap(e);
        }
    }
    std::fseek(aus, 8, SEEK_SET);
    std::fwrite(&geschrieben, 8, 1, aus);
    if (std::fclose(aus) != 0) { std::remove(ausPfad); throw std::runtime_error("Schreiben fehlgeschlagen"); }
    return geschrieben;
}

#ifdef TOPOVO_PRUEFEN
#include <chrono>
int main(int argc, char **argv) {
    if (argc < 8) { std::fprintf(stderr, "laz aus X0 X1 Y0 Y1 faeden\n"); return 2; }
    auto t0 = std::chrono::steady_clock::now();
    try {
        uint64_t n = schneiden(argv[1], argv[2], std::atoi(argv[3]), std::atoi(argv[4]), std::atoi(argv[5]), std::atoi(argv[6]), std::atoi(argv[7]));
        double s = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
        std::printf("%llu Punkte, %.2f s\n", (unsigned long long)n, s);
    } catch (const std::exception &x) { std::fprintf(stderr, "Fehler: %s\n", x.what()); return 1; }
    return 0;
}
#else
#include <jni.h>
/* de.topovo.app.Nativ.schneiden(laz, aus, X0, X1, Y0, Y1, faeden): Anzahl der Punkte, oder −1 (Text in fehler()). */
static std::string letzterFehler;
extern "C" JNIEXPORT jlong JNICALL Java_de_topovo_app_Nativ_schneiden(JNIEnv *env, jclass, jstring laz, jstring aus,
        jint X0, jint X1, jint Y0, jint Y1, jint faeden) {
    const char *l = env->GetStringUTFChars(laz, nullptr), *a = env->GetStringUTFChars(aus, nullptr);
    jlong r;
    try { r = (jlong)schneiden(l, a, X0, X1, Y0, Y1, faeden); letzterFehler.clear(); }
    catch (const std::exception &x) { letzterFehler = x.what(); r = -1; }
    env->ReleaseStringUTFChars(laz, l);
    env->ReleaseStringUTFChars(aus, a);
    return r;
}
extern "C" JNIEXPORT jstring JNICALL Java_de_topovo_app_Nativ_fehler(JNIEnv *env, jclass) {
    return env->NewStringUTF(letzterFehler.c_str());
}
#endif
