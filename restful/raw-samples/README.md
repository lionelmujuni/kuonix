# RAW troubleshooting samples

Drop sample image files here (`.dng`, `.cr2`, `.cr3`, `.nef`, `.arw`, `.raf`,
`.rw2`, `.orf`, `.jpg`, `.tif`, …) to inspect what EXIF the pipeline can read
from them. The heavy binaries are git-ignored — only this README and `.gitkeep`
are tracked, so you can park large RAWs here without bloating the repo.

`ExifDumpTest` reads from this folder by default. For every file it prints (and
writes to `restful/exif-dump.txt`):

1. **RAW METADATA DUMP** — every metadata directory + tag metadata-extractor
   finds, plus any parse errors.
2. **ExifExtractorService.extract() OUTPUT** — what our service actually pulls
   out, so the gap is obvious.

## Running

The `test` task is incremental, so use `cleanTest` to force a re-run when you
change the inputs:

```powershell
# Dump every file in this folder
.\gradlew cleanTest test --tests "app.restful.ExifDumpTest"

# Or point at one file / another folder (absolute paths; quote if it has spaces)
.\gradlew cleanTest test --tests "app.restful.ExifDumpTest" "-DexifDumpPath=C:\path\to\file.dng"
.\gradlew cleanTest test --tests "app.restful.ExifDumpTest" "-DexifDir=C:\some\folder"
```

The test is skipped during normal `gradlew test` runs (no input configured).
