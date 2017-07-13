"use strict";

const WebOSDevice = require('..').WebOSDevice;

let remote = new WebOSDevice({
	address	: process.argv[2] || '192.168.1.68',
	key		: process.argv[3] || '78ca390e682a061e34fd6d5b890c7999',
	debug	: true
});

remote.on('key', key => {
	console.log('Key:', key);
})

setInterval(sendToast, 1000);
sendToast();

var i = 0;

function sendToast() {
	
	if( ++i > 3 ) return;
	
	let msg = new Date();
	
	remote.showFloat(`Test float: ${msg}!`)
		.then( result => {
			console.log(`Result:`, result);
		})
		.catch( err => {
			console.error(`Error:`, err);
		});
	
}