# adb-backup-extract

Unpacks **_".ab"_** Android backups made using adb backup into regular **_".tar"_** archives that can be opened with common archival tools like 7-zip and WinRAR.

## Usage

Download _adb_extract.exe_ from the [releases](https://github.com/ParadoxEpoch/adb-backup-extract/releases/latest) section or grab the latest [source code](https://github.com/ParadoxEpoch/adb-backup-extract/archive/refs/heads/main.zip) if you prefer to run from source.

From the command line, run the binary as shown below, replacing Backup.ab and Output.tar with your desired input and output files:

```
adb_extract.exe Backup.ab Output.tar
```

If your backup is encrypted with a password, include the password when launching adb_extract like so:

```
adb_extract.exe Backup.ab Output.tar myPassword
```

Don't know if your backup is encrypted? No stress, if you run the tool without a password and your backup is encrypted, you'll be prompted to enter one.

## Building

Download and extract the latest [source code](https://github.com/ParadoxEpoch/adb-backup-extract/archive/refs/heads/main.zip) or use `git clone https://github.com/ParadoxEpoch/adb-backup-extract` to clone the repository to your machine.

Run `npm install` to install the build dependencies.

Run `npm run build` to package release binaries.
