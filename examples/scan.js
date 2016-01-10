"use strict";

var Scanner = require('..').Scanner;
var scanner = new Scanner();

scanner.startScanning();
scanner.on('device', function(device){
	console.log('device', device)
	
	scanner.stopScanning();
	
})