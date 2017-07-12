"use strict";

const WebOSScanner = require('..').WebOSScanner;
let scanner = new WebOSScanner();

scanner.start();
scanner.on('device', function(device){
	console.log('device', device)	
})