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

//setInterval(sendToast, 1000);
sendToast();

//var i = 0;

function sendToast() {
	console.log('sendToast()');
	
	//if( ++i > 3 ) return;
	
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
		
	}, 500);
	
}