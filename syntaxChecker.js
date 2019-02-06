let nodegit = require('nodegit');
let fs = require('fs');
let esprima = require('esprima');

var directory = '/mnt/yantra/npm/projects/npm/';
function getFileList() {
	let list = {};
	let libraryName = process.argv[2];
	let passedFiles = process.argv.slice(3);
	if (libraryName) {
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
				.split('\n')
				.filter(element => element !== '' || element);
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

const findRequest = object => {
	var result = { finish: false, result: false };
	var requireFound = false;
	for (var key in object) {
		var value = object[key];

		if (requireFound && key === 'arguments') {
			if (object[key][0].type === 'BinaryExpression') {
				return { finish: true, result: false };
			} else if (object[key][0].type === 'Literal') {
				if (object[key][0].value.charAt(0) !== ('.' || '/')) {
					return { finish: true, result: true };
				}
			}
		}

		if (key === 'callee' && object[key].name === 'require') {
			requireFound = true;
		}

		if (typeof value === 'object' && !requireFound) {
			result = findRequest(value);
		}

		if (result.finish) return { finish: true, result: result.result };
	}

	return { finish: result.finish, result: result.result };
};

const findRequestValue = object => {
	var result = {
		finish: false,
		value: '',
		method: '',
		libraryFound: false,
		requireFound: false
	};
	for (var key in object) {
		var value = object[key];

		if (result.libraryFound && key === 'property') {
			if (object[key].name) {
				return { ...result, finish: true, method: object[key].name };
			}
		}

		if (result.requireFound && key === 'arguments' && !result.libraryFound) {
			result = { ...result, value: object[key][0].value, libraryFound: true };
		}

		if (
			key === 'callee' &&
			object[key].name === 'require' &&
			!result.requireFound
		) {
			result = { ...result, requireFound: true };
		}

		if (typeof value === 'object' && !result.requireFound) {
			result = findRequestValue(value);
		}

		if (key === 'callee' && result.value) {
			return { ...result, finish: true };
		}

		if (result.finish) return result;
	}

	return result;
};

const getRequestData = object => {
	var result = { variable: null, library: null, method: null };
	var isVariable = false;
	var gotVariable = false;
	var variableName = '';
	var libraryName = '';
	for (var key in object) {
		var value = object[key];

		if (gotVariable) {
			libraryName = findRequestValue(object[key]);
			return {
				variable: variableName,
				library: libraryName.value,
				method: libraryName.method
			};
		}

		if (key === 'id' && isVariable) {
			variableName = object[key].name;
			gotVariable = true;
		}

		if (value === 'VariableDeclarator') {
			isVariable = true;
		}

		if (typeof value === 'object' && !isVariable) {
			result = getRequestData(value);
		}

		if (result.variable && result.library) return result;
	}

	return result;
};

const findMethodValue = (variable, object, result = {}) => {
	var methodFound = false;

	for (var key in object) {
		var value = object[key];

		if (
			['object', 'callee'].includes(key) &&
			object[key].type === 'Identifier' &&
			object[key].name === variable
		) {
			methodFound = true;
		} else if (key === 'property' && methodFound) {
			methodFound = false;
			result = { ...result, [object[key].name]: true };
		} else if (typeof value === 'object') {
			result = findMethodValue(variable, value, result);
		}
	}

	if (methodFound) {
		result = { ...result, 'main_method*': true };
	}

	return result;
};

async function getFunctions() {
	let libraryName = process.argv[2];
	let list = getFileList();
	let repository = nodegit.Repository.open(directory + libraryName + '/.git');

	var directoryName = 'filesMethods/' + libraryName;
	if (!fs.existsSync(directoryName)) {
		fs.mkdirSync(directoryName);
	}

	for (var element in list) {
		await repository.then(async function(repo) {
			await repo.getCommit(list[element].hash).then(async function(commit) {
				var fullMethods = {};
				var fileName = directoryName + '/' + element;
				var logFile = fs.createWriteStream(fileName, { flags: 'w' });
				for (let file in list[element].files) {
					logFile.write('------------------------------------------\n');
					logFile.write(list[element].files[file] + '\n');
					logFile.write('------------------------------------------\n');
					await commit
						.getEntry(list[element].files[file])
						.then(async function(entry) {
							await entry.getBlob().then(async function(blob) {
								try {
									var parsedScript = esprima.parseScript(blob.toString());
								} catch (err) {
									var error = err;
								}

								if (parsedScript) {
									var objectifiedScript = JSON.parse(
										JSON.stringify(parsedScript.body, null, 2)
									);

									var filteredResult = objectifiedScript.filter(entry => {
										return findRequest(entry).result;
									});
									var variableNames = [];

									filteredResult.forEach(element => {
										var info = getRequestData(element);
										if (info.variable !== null) variableNames.push(info);
									});

									var methodCallNames = {};

									variableNames
										.filter(element => element.method !== '')
										.forEach(element => {
											methodCallNames[element.library] = {
												...methodCallNames[element.library],
												[element.method]: true
											};
										});

									variableNames
										.filter(element => element.method === '')
										.forEach(element => {
											var info = findMethodValue(
												element.variable,
												objectifiedScript
											);

											for (var key in info) {
												methodCallNames[element.library] = {
													...methodCallNames[element.library],
													[key]: true
												};
											}
										});

									if (Object.keys(methodCallNames).length > 0) {
										Object.keys(methodCallNames).forEach(key => {
											logFile.write(`Library: ${key}\n`);
											logFile.write('Methods Called:\n');
											Object.keys(methodCallNames[key]).forEach(method => {
												logFile.write(`   - ${method}\n`);
												fullMethods[key] = {
													...fullMethods[key],
													[method]: true
												};
											});
											logFile.write('\n');
										});
									} else {
										logFile.write('No functions in this file\n');
										logFile.write('\n');
									}
								} else {
									logFile.write('!!!!!!!!!!!!!!!!!!! ERROR at parsing\n');
									logFile.write(error.toString());
									logFile.write('\n');
								}
							});
						});
				}
				logFile.write('\nAll of the Methods:\n');
				logFile.write(JSON.stringify(fullMethods, null, 2));
				logFile.end();
			});
		});
	}

	return true;
}

getFunctions();
