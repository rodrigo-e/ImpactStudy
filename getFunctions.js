let nodegit = require('nodegit');
let fs = require('fs');
let functionExtractor = require('function-extractor');
var escomplex = require('escomplex');
let sortObject = require('sort-object');
let diff = require('deep-diff');

let functionsList = {};
let libraryName = '';

function getFileList() {
	let list = {};
	libraryName = process.argv[2];
	passedFiles = process.argv.slice(3);
	if (libraryName) {
		let repository = nodegit.Repository.open(
			'/mnt/yantra/rodrigo-e/LibraryTool/npm/' + libraryName + '/.git'
		);
		let fileLists =
			passedFiles.length > 0
				? passedFiles
				: fs.readdirSync('fileLists/' + libraryName);

		for (let file in fileLists) {
			let count = 0;
			let hash = '';
			let data = fs
				.readFileSync(
					'fileLists/' + libraryName + '/' + fileLists[file],
					'utf8'
				)
				.toString()
				.split('\n');
			for (let line in data) {
				if (count === 0) {
					hash = data[line];
					list[fileLists[file]] = { hash: hash, files: [] };
				} else {
					list[fileLists[file]].files.push(data[line]);
				}
				count += 1;
			}
		}
	} else {
		console.log('Please provide library name');
	}

	return list;
}

async function getFunctions() {
	let libraryName = process.argv[2];
	let list = getFileList();
	let repository = nodegit.Repository.open(
		'/mnt/yantra/rodrigo-e/LibraryTool/npm/' + libraryName + '/.git'
	);
	for (let element in list) {
		await repository.then(async function(repo) {
			await repo.getCommit(list[element].hash).then(async function(commit) {
				let functionsListTmp = {};
				for (let file in list[element].files) {
					await commit
						.getEntry(list[element].files[file])
						.then(function(entry) {
							entry.getBlob().then(function(blob) {
								let functions = functionExtractor.parse(blob.toString());
								for (let i in functions) {
									if (functions[i].loc.column === 0) {
										let paramsList = [];
										if (functions[i].params.length !== 0) {
											for (let param in functions[i].params) {
												paramsList.push(functions[i].params[param].name);
											}
										}
										functionsListTmp[functions[i].name] = paramsList;
									}
								}
							});
						});
				}
				functionsList[element] = sortObjectList(functionsListTmp);
			});
		});
	}
	//
	// let directoryName = 'filesFunctions/' + libraryName;
	// if (!fs.existsSync(directoryName)) {
	// 	fs.mkdirSync(directoryName);
	// }
	//
	// let myKeysList = [];
	// const gottenKeys = process.argv.slice(3);
	// if (gottenKeys) {
	// 	myKeysList = gottenKeys;
	// } else {
	// 	Object.keys(functionsList).forEach(key => {
	// 		myKeysList.push(key);
	// 	});
	//
	// 	myKeysList.sort();
	// }
	//
	// console.log(myKeysList);
	//
	// for (let i = 0; i < myKeysList.length; i++) {
	// 	let fileName = directoryName + '/' + myKeysList[i];
	// 	let logFile = fs.createWriteStream(fileName, { flags: 'w' });
	// 	Object.keys(functionsList[myKeysList[i]]).forEach(key => {
	// 		let tmp = '';
	// 		tmp = key;
	// 		tmp += '(';
	// 		let first = true;
	// 		for (let value in functionsList[myKeysList[i]][key]) {
	// 			if (first) {
	// 				tmp += functionsList[myKeysList[i]][key][value];
	// 				first = false;
	// 			} else {
	// 				tmp += ', ' + functionsList[myKeysList[i]][key][value];
	// 			}
	// 		}
	// 		tmp += ');\n';
	// 		logFile.write(tmp);
	// 	});
	// }

	return true;
}

function test() {
	getFunctions()
		.then(() => {
			let directoryName = 'filesComparison/' + libraryName;
			if (!fs.existsSync(directoryName)) {
				fs.mkdirSync(directoryName);
			}

			let myKeysList = [];
			const gottenKeys = process.argv.slice(3);
			if (gottenKeys) {
				myKeysList = gottenKeys;
			} else {
				Object.keys(functionsList).forEach(key => {
					myKeysList.push(key);
				});

				myKeysList.sort();
			}

			for (let i = 0; i < myKeysList.length - 1; i++) {
				let pairName =
					'[' +
					myKeysList[i].slice(0, -4) +
					']-[' +
					myKeysList[i + 1].slice(0, -4) +
					'].txt';
				let fileName = directoryName + '/' + pairName;
				let differences = diff(
					functionsList[myKeysList[i]],
					functionsList[myKeysList[i + 1]]
				);

				let logFile = fs.createWriteStream(fileName, { flags: 'w' });
				let diffObj = {};

				logFile.write(
					myKeysList[i].slice(0, -4) +
						' - ' +
						myKeysList[i + 1].slice(0, -4) +
						'\n'
				);
				logFile.write('----------------------------------------\n');

				for (let element in differences) {
					switch (differences[element].kind) {
						case 'A':
						case 'E':
							if (!diffObj['Edited']) {
								diffObj['Edited'] = {};
							}

							if (!diffObj['Edited'][differences[element].path[0]]) {
								diffObj['Edited'][differences[element].path[0]] = {};
								diffObj['Edited'][differences[element].path[0]]['Before'] =
									functionsList[myKeysList[i]][differences[element].path[0]];
								diffObj['Edited'][differences[element].path[0]]['After'] =
									functionsList[myKeysList[i + 1]][
										differences[element].path[0]
									];
							}
							break;

						case 'N':
							if (!diffObj['Added']) {
								diffObj['Added'] = {};
							}

							if (!diffObj['Added'][differences[element].path[0]]) {
								diffObj['Added'][differences[element].path[0]] =
									functionsList[myKeysList[i + 1]][
										differences[element].path[0]
									];
							}
							break;

						case 'D':
							if (!diffObj['Deleted']) {
								diffObj['Deleted'] = {};
							}

							if (!diffObj['Deleted'][differences[element].path[0]]) {
								diffObj['Deleted'][differences[element].path[0]] =
									functionsList[myKeysList[i]][differences[element].path[0]];
							}
							break;

						default:
							console.log("That kind doesn't exist");
							break;
					}
				}

				if (Object.keys(diffObj).length === 0) {
					logFile.write('There were no Changes between releases\n');
					logFile.write('\n');
				} else {
					let numEdited = diffObj['Edited']
						? Object.keys(diffObj['Edited']).length
						: 0;
					let numAdded = diffObj['Added']
						? Object.keys(diffObj['Added']).length
						: 0;
					let numDeleted = diffObj['Deleted']
						? Object.keys(diffObj['Deleted']).length
						: 0;
					let numTotal = numEdited + numAdded + numDeleted;

					logFile.write(
						'Number of methods modified: ' +
							numTotal +
							' (A: ' +
							numAdded +
							', D: ' +
							numDeleted +
							', E: ' +
							numEdited +
							')\n'
					);
					logFile.write('\n');

					if (diffObj['Added']) {
						logFile.write('Functions Added:\n');
						logFile.write('-----------------------------------\n');
						for (let element in diffObj['Added']) {
							let tmp = '';
							tmp = element;
							tmp += '(';
							let first = true;
							for (let value in diffObj['Added'][element]) {
								if (first) {
									tmp += diffObj['Added'][element][value];
									first = false;
								} else {
									tmp += ', ' + diffObj['Added'][element][value];
								}
							}
							tmp += ');';
							logFile.write('   - ' + tmp + '\n');
						}
						logFile.write('\n');
					}

					if (diffObj['Deleted']) {
						logFile.write('Functions Deleted:\n');
						logFile.write('-----------------------------------\n');
						for (let element in diffObj['Deleted']) {
							let tmp = '';
							tmp = element;
							tmp += '(';
							let first = true;
							for (let value in diffObj['Deleted'][element]) {
								if (first) {
									tmp += diffObj['Deleted'][element][value];
									first = false;
								} else {
									tmp += ', ' + diffObj['Deleted'][element][value];
								}
							}
							tmp += ');';
							logFile.write('   - ' + tmp + '\n');
						}
						logFile.write('\n');
					}

					if (diffObj['Edited']) {
						logFile.write('Functions Edited:\n');
						logFile.write('-----------------------------------\n');
						for (let element in diffObj['Edited']) {
							let tmp = '';
							let functionName = '';
							tmp = element;
							tmp += '(';
							functionName = tmp;
							let first = true;
							for (let value in diffObj['Edited'][element].Before) {
								if (first) {
									tmp += diffObj['Edited'][element].Before[value];
									first = false;
								} else {
									tmp += ', ' + diffObj['Edited'][element].Before[value];
								}
							}
							tmp += ') => ' + functionName;
							first = true;
							for (let value in diffObj['Edited'][element].After) {
								if (first) {
									tmp += diffObj['Edited'][element].After[value];
									first = false;
								} else {
									tmp += ', ' + diffObj['Edited'][element].After[value];
								}
							}
							tmp += ');';
							logFile.write('   - ' + tmp + '\n');
						}
						logFile.write('\n');
					}
				}
			}
		})
		.catch(error => {
			console.log(error);
		});
}

function sortObjectList(obj) {
	let arr = Object.keys(obj);
	let listTmp = {};
	arr.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

	for (let element in arr) {
		listTmp[arr[element]] = obj[arr[element]];
	}

	return listTmp;
}

test();
