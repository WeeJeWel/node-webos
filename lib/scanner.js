"use strict";

var util		= require('util');
var events		= require('events');
var dgram 		= require('dgram');

function Scanner() {
	
	this.scanning 			= false;
	this.foundDevices 		= [];
	
}
util.inherits( Scanner, events.EventEmitter );


/*
	Start scanning for TVs
*/
Scanner.prototype.startScanning = function() {
	if( this.scanning === true ) return new Error("already scanning");

	this.scanning = true;	
	this.server = dgram.createSocket('udp4');
	this.foundDevices = [];
	
	// when server has opened, send a SSDP discover message
	this.server
		.on('listening', function() {
		    var ssdp_rhost = "239.255.255.250";
		    var ssdp_rport = 1900;
	
		    // these fields are all required
		    var ssdp_msg = 'M-SEARCH * HTTP/1.1\r\n';
		    ssdp_msg += 'HOST: 239.255.255.250:1900\r\n';
		    ssdp_msg += 'MAN: "ssdp:discover"\r\n';
		    ssdp_msg += 'MX: 5\r\n';
		    ssdp_msg += "ST: urn:dial-multiscreen-org:service:dial:1\r\n";
		    ssdp_msg += "USER-AGENT: iOS/5.0 UDAP/2.0 iPhone/4\r\n\r\n";
		    var message = new Buffer(ssdp_msg);
	
		    this.server.send(message, 0, message.length, ssdp_rport, ssdp_rhost);
		}.bind(this))
		
		// scan incoming messages for the magic string
		.on('message', function(message, remote) {
			message = message.toString();
		    if( message.indexOf("WebOS") < 0 ) return;
		    if( this.foundDevices.indexOf(remote.address) > -1 ) return;
		    this.foundDevices.push(remote.address);
		    
		    var headers = httpHeadersStringToObject( message );
		    
		    var device = {
			    address		: remote.address,
			    uuid		: headers['USN'].split(':')[1]
		    }
		    
	        this.emit('device', device)
		}.bind(this))
		
		// listen to 0.0.0.0:random
		.bind()

}

/*
	Stop scanning for TVs
*/
Scanner.prototype.stopScanning = function() {
	if( this.scanning !== true ) return new Error("not scanning");
	
	this.scanning = false;
	this.foundDevices = [];
	this.server.close();
}

module.exports = Scanner;

/*
	Helper functions
*/
function httpHeadersStringToObject( headers ) {
	headers = headers.split("\r\n");
		
	var result = {};
	headers.forEach(function(header){
		header = header.split(':');
		if( header.length < 2 ) return;
		header = [header.shift(), header.join(':')]
		if( header[0].length < 1 ) return;
		header[0] = header[0].trim();
		header[1] = header[1].trim();
		result[ header[0] ] = header[1];
	})
	return result;
}