"use strict";

const WebOSDiscovery = require('..').WebOSDiscovery;
let discovery = new WebOSDiscovery({
	debug: true
});

discovery
	.on('device', device => {
		console.log('Device found!');
		console.log('* Name:', device.getOpt('name'));
		console.log('* Address:', device.getOpt('address'));
		console.log('* ID:', device.getOpt('id'));
	})
	.start()