var nodegit = require('nodegit');
var fs = require('fs');

var directory = '/mnt/yantra/npm/projects/npm/';

async function getFileList() {
	// This code walks the history of the master branch and prints results
	// that look very similar to calling `git log` from the command line
	var commitList = {};
	var libraryName = process.argv[2];
	// var libraryName = 'angular';
	if (libraryName) {
		nodegit.Repository.open(directory + libraryName + '/.git')
			.then(function(repo) {
				return repo.getMasterCommit();
			})
			.then(function(firstCommitOnMaster) {
				// History returns an event.
				var history = firstCommitOnMaster.history(nodegit.Revwalk.SORT.Time);
				var _entry;
				var version = '';
				var prevSha = '';

				// History emits "commit" event for each commit in the branch's history
				history.on('commit', function(commit) {
					commit
						.getEntry('package.json')
						.then(function(entry) {
							_entry = entry;
							return _entry.getBlob();
						})
						.then(function(blob) {
							var tmpVersion = JSON.parse(blob.toString()).version;
							if (version !== tmpVersion) {
								if (prevSha !== '')
									if (!commitList[version]) commitList[version] = prevSha;
							}
							version = tmpVersion;
							prevSha = commit.sha();
						});
				});

				history.on('end', function() {
					if (!commitList[version]) commitList[version] = prevSha;
					console.log(commitList);
					var directoryName = 'fileLists/' + libraryName;
					if (!fs.existsSync(directoryName)) {
						fs.mkdirSync(directoryName);
					}

					nodegit.Repository.open(directory + libraryName + '/.git').then(
						async function(repo) {
							for (var commitVersion in commitList) {
								await repo
									.getCommit(commitList[commitVersion])
									.then(function(commit) {
										var tmpSha = commitList[commitVersion];
										var fileName =
											directoryName + '/R_' + commitVersion + '.txt';
										var listTmp = [];
										commit.getTree().then(function(tree) {
											var walker = tree.walk();
											walker.on('entry', function(entry) {
												var ext = entry
													.path()
													.substr(entry.path().lastIndexOf('.') + 1);
												if (ext === 'js' || ext === 'jsx') {
													listTmp.push(entry.path());
												}
											});
											walker.on('end', function() {
												fs.writeFile(
													fileName,
													tmpSha +
														'\n' +
														listTmp
															.sort()
															.toString()
															.replace(/,/g, '\n'),
													function(err) {
														if (err) throw err;
													}
												);
											});
											walker.start();
										});
									});
							}
						}
					);
				});

				// Don't forget to call `start()`!
				history.start();
			})
			.done();
	} else {
		console.log('Please provide library name');
	}
}

async function test() {
	await getFileList();
}

test();
