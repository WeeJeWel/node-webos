"use strict";

var Remote = require('..').Remote;
var remote = new Remote();

/*
remote.startScanning();
remote.on('discover', function(device){
	console.log('device', device)
	
	remote.stopScanning();
	
	remote.connect({
		address: device.address
	}, console.log)
	
})
*/

remote.connect({
	address: '192.168.0.109',
	key: '4d5b7754bb3cc6475ffb3ca09a14dee9'
}, function( err, key ){
	
	remote.show_float( "Test" )
	
	remote.getChannels(console.log)
})


/*
remote.connect({}, function( err, success ){
	console.log(arguments)
});
*/