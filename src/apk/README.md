Open APK/AAB (yauzl), list native libraries (lib/<abi>/*.so, base/lib/<abi>/*.so), parse ELF64 program headers and check
PT_LOAD p_align >= 16384; for APKs also check uncompressed .so entries are 16 KB aligned. Map each .so to its npm package.
