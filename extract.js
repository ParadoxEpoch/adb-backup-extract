const fs = require('fs');
const zlib = require('zlib');
const crypto = require('crypto');
const readline = require('readline');

console.log('\n\x1b[1mAndroid Backup Extractor\x1b[0m\n');

// Get the backup file name from the command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
	console.error('Usage: adb_extract.exe <backup.ab> <output.tar> [password]');
	process.exit(1);
}

async function extractAsTar(backupFilename, outputFile, password) {
	try {

		// Check if the backup file exists
		if (!fs.existsSync(backupFilename)) {
			throw new Error(`Backup file does not exist: ${backupFilename}`);
		}

		console.log(`Input File: ${backupFilename.split('\\').pop().split('/').pop()}`);
		/* console.log(`Output File: ${outputFile.split('\\').pop().split('/').pop()}\n`); */

		if (fs.statSync(backupFilename).size === 0) {
			throw new Error("File too small in size");
		}

		const fileSize = fs.statSync(backupFilename).size;

		const headerData = await readHeaderData(backupFilename);

		const magicStr = headerData[0];
		if (magicStr !== 'ANDROID BACKUP') {
			throw new Error(`Invalid magic string: ${magicStr}`);
		}

		const versionStr = headerData[1];
		console.log(`File Version: ${versionStr}`);
		const version = parseInt(versionStr, 10);
		if (version < 1 || version > 5) {
			throw new Error(`Don't know how to process version ${versionStr}`);
		}

		const compressedStr = headerData[2];
		const isCompressed = parseInt(compressedStr, 10) === 1;
		console.log(`Compressed: ${isCompressed}`);

		const encryptionStr = headerData[3];
		console.log(`Encryption: ${encryptionStr}`);
		let isEncrypted = encryptionStr === 'AES-256';

		// Calculate header data length to use as the data offset
		// Length of each headerData line + 1 for the 0x0A line break
		let offset = 0;
		for (let i = 0; i < headerData.length; i++) {
			offset += headerData[i].length + 1;
		}

		console.log(`Header length: ${offset} bytes`);

		// Log backup file size in MB
		console.log(`Backup size: ${Math.round(fileSize / 1024 / 1024)} MB`);

		console.log(`\n\x1b[32mBackup file appears to be valid!\x1b[0m`);

		//process.exit(0);

		let rawInStream = fs.createReadStream(backupFilename, { start: offset });

		const baseStream = isEncrypted ? await decryptBackup(rawInStream, headerData, password) : rawInStream;
		const outStream = fs.createWriteStream(outputFile);
		let streamToWrite = baseStream;

		let inflate;

		if (isCompressed) {
			inflate = zlib.createInflate();
			inflate.on('error', (err) => {
				console.error('\n\nError: ' + err.message);
				console.log(`\x1b[31m\x1b[1m✗ Something went wrong while unpacking. The backup file may be corrupted.\x1b[0m`);
				process.exit(1);
			});
			streamToWrite = baseStream.pipe(inflate);
		}

		console.log(`\nCreating \x1b[3m${outputFile.split('\\').pop().split('/').pop()}\x1b[0m, please wait...\n`);

		const progressChunk = '░';
		const progressCompleteChunk = '█';
		const progressBar = {
			update: function (value) {
				const progress = Math.round((value / fileSize) * 100);
				const totalChunks = 40;
				const completeChunks = Math.round((progress / 100) * totalChunks);
				const incompleteChunks = 40 - completeChunks;
				const progressStr = progressCompleteChunk.repeat(completeChunks) + progressChunk.repeat(incompleteChunks);
				process.stdout.write(`\r\x1b[2K\x1b[36m${progressStr} \x1b[0m${progress}% `);
			},
			stop: function () {
				process.stdout.write('\n');
			}
		};

		streamToWrite.on('data', (chunk) => {
			outStream.write(chunk);
			progressBar.update(inflate.bytesWritten);
		});

		streamToWrite.on('end', () => {
			outStream.end();
			progressBar.stop();
			console.log(`\n\x1b[32m\x1b[1m✓ Backup extraction complete!\x1b[0m`);
			process.exit(0);
		});
	} catch (e) {
		throw e;
	}
}

async function decryptBackup(rawInStream, headerData, password) {

	async function askForPassword() {
		const readInput = readline.createInterface({
			input: process.stdin,
			output: process.stdout
		});

		console.log(`\n\x1b[33mBackup is encrypted. Please enter the password to decrypt.\x1b[0m`)

		password = await new Promise((resolve) => {
			readInput.question(`\n\x1b[1mPassword: \x1b[0m`, userInput => {
				readInput.close();
				resolve(userInput);
			});
		});

		readline.moveCursor(process.stdout, 0, -4);
		readline.clearScreenDown(process.stdout);
	}

	if (!password) await askForPassword();

	const userSalt = Buffer.from(headerData[4], 'hex');
	if (userSalt.length !== 64) {
		throw new Error(`Invalid salt length: ${userSalt.length}`);
	}

	//const ckSalt = Buffer.from(headerData[5], 'hex');
	const rounds = parseInt(headerData[6], 10);
	const iv = Buffer.from(headerData[7], 'hex');
	const mkCipher = Buffer.from(headerData[8], 'hex');

	const userKey = crypto.pbkdf2Sync(password, userSalt, rounds, 32, 'sha1');
	const decipher = crypto.createDecipheriv('aes-256-cbc', userKey, iv);

	let mkBlob = null;

	try {
		mkBlob = Buffer.concat([decipher.update(mkCipher), decipher.final()]);
	} catch (e) {
		console.log(`\n\x1b[31m\x1b[1m✗ Incorrect password. Please try again.\x1b[0m`);
		return await decryptBackup(rawInStream, headerData);
	}

	console.log(`\n\x1b[32mBackup decrypted!\x1b[0m`);

	let offset = 0;
	let len = mkBlob[offset++];
	const mkIv = mkBlob.subarray(offset, offset + len);
	offset += len;
	len = mkBlob[offset++];
	const mk = mkBlob.subarray(offset, offset + len);

	const masterDecipher = crypto.createDecipheriv('aes-256-cbc', mk, mkIv);
	return rawInStream.pipe(masterDecipher);
}

async function readHeaderData(filename) {
	return new Promise((resolve, reject) => {
		const readStream = fs.createReadStream(filename);
		const reader = readline.createInterface({
			input: readStream,
			crlfDelay: Infinity
		});

		let maxLinesToRead = 4;
		let linesRead = 0;
		let dataRead = [];

		// Read data until the next line break (0x0A)
		reader.on('line', (line) => {
			if (linesRead >= maxLinesToRead) {
				reader.close();
				readStream.destroy();
			} else {
				if (linesRead === 3 && line === 'AES-256') {
					// If the backup is encrypted, there are more lines containing encryption data
					maxLinesToRead = 9;
				}
				dataRead.push(line);
				linesRead++;
			}
		});

		reader.on('close', () => resolve(dataRead));
		reader.on('error', (err) => reject(err));
	});
}

(async () => {
	try {
		await extractAsTar(args[0], args[1], args[2]);
	} catch (error) {
		console.error(`\n\x1b[31m${error.message}\n\n\x1b[1m✗ Something went wrong!\x1b[0m\n`);
		//console.log(`\x1b[31m\x1b[1m✗ Something went wrong!\x1b[0m`);
	}
})();