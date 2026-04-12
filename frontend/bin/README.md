# dcraw_emu Binary Setup

This directory contains platform-specific dcraw_emu binaries for RAW image processing.

## Required Binaries

### Windows (win32/)
- **File**: `dcraw_emu.exe`
- **Source**: LibRaw 0.21+ Windows x64 build
- **Download**: https://www.libraw.org/download
- **Instructions**: Download the Windows binary package and extract `dcraw_emu.exe` to `win32/`

### Linux (linux/)
- **File**: `dcraw_emu`
- **Source**: LibRaw 0.21+ Linux x64 build
- **Download**: https://www.libraw.org/download
- **Instructions**: 
  1. Download the Linux binary package and extract `dcraw_emu` to `linux/`
  2. Make executable: `chmod +x linux/dcraw_emu`

### macOS (darwin/)
- **File**: `dcraw_emu`
- **Source**: LibRaw 0.21+ (compile from source or Homebrew)
- **Instructions**:
  - **Option 1 - Homebrew**: `brew install libraw` then copy from `/opt/homebrew/bin/dcraw_emu`
  - **Option 2 - Compile**: Download source from LibRaw.org and compile for Universal or x64
  - Make executable: `chmod +x darwin/dcraw_emu`

## Verification

After placing binaries, verify they work:

**Windows PowerShell:**
```powershell
.\win32\dcraw_emu.exe -v
```

**Linux/macOS:**
```bash
./linux/dcraw_emu -v   # or darwin/dcraw_emu
```

Expected output: LibRaw version information and supported formats.

## Binary Files to Place

```
bin/
├── README.md (this file)
├── win32/
│   └── dcraw_emu.exe     ← Download and place here
├── darwin/
│   └── dcraw_emu         ← Provide/compile and place here
└── linux/
    └── dcraw_emu         ← Download and place here
```

## License

LibRaw is dual-licensed under LGPL v2.1 or CDDL v1.0. Ensure compliance when distributing binaries with the application.
