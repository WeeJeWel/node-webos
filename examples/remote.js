"use strict";

const WebOSDevice = require('..').WebOSDevice;

let remote = new WebOSDevice({
	address	: process.argv[2] || '192.168.1.68',
	key		: process.argv[3] || '78ca390e682a061e34fd6d5b890c7999',
	debug	: false
});

remote.on('key', key => {
	console.log('Key:', key);
})

setInterval(sendToast, 1000);
sendToast();

function sendToast() {
	
	let i = new Date();
	
	remote.showFloat(`Test float: ${i}!`)
		.then( result => {
			console.log(`Result ${i}:`, result);
		})
		.catch( err => {
			console.error(`Error ${i}:`, err);
		});
	
}