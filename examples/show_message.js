"use strict";

var Remote = require('..');
var remote = new Remote();

remote.startScanning();
remote.on('discover', console.log)



/*
remote.connect({}, function( err, success ){
	console.log(arguments)
});
*/