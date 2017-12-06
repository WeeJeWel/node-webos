"use strict";

const WebOSDevice = require('..').WebOSDevice;

let remote = new WebOSDevice({
	address	: process.argv[2] || '192.168.1.56',
	key		: process.argv[3] || '78ca390e682a061e34fd6d5b890c7999',
	debug	: false
});

remote.on('key', key => {
	console.log('Key:', key);
})

sendToast();
getInputs();

function getInputs() {
	console.log('getInputs()');
	
	remote.getInputs()
		.then( console.log.bind( null, '[log]' ) )
		.catch( console.error.bind( null, '[err]' ))
}

function sendToast() {
	console.log('sendToast()');
	
	setTimeout(() => {
	
		let msg = new Date();
		
		remote.createToast(`Test float: ${msg}!`)
			.then( result => {
				console.log(`Result:`, result);
				sendToast();
			})
			.catch( err => {
				console.error(`Error:`, err);
				sendToast();
			});
		
	}, 1000);
	
}