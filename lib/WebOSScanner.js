'use strict';

const http			= require('http');
const events		= require('events');
const dgram 		= require('dgram');

const WebOSDevice	= require('./WebOSDevice');

class WebOSScanner extends events.EventEmitter {
	
	constructor() {
		super();
		
		this._scanning = false;
		this._devices = {};
		
	}
	
	start() {
		if( this._scanning ) return;
		
		this._server = dgram.createSocket('udp4');
		this._server
			.on('listening', this._onServerListening.bind( this ))
			.on('message', this._onServerMessage.bind( this ))
			.bind();
		
	}
	
	stop() {
		
	}
	
	_onServerListening() {
		
	    let ssdp_rhost = "239.255.255.250";
	    let ssdp_rport = 1900;

	    let ssdp_msg = 'M-SEARCH * HTTP/1.1\r\n';
	    	ssdp_msg += 'HOST: 239.255.255.250:1900\r\n';
			ssdp_msg += 'MAN: "ssdp:discover"\r\n';
			ssdp_msg += 'MX: 5\r\n';
			ssdp_msg += "ST: urn:lge-com:service:webos-second-screen:1\r\n";
			ssdp_msg += "USER-AGENT: iOS/5.0 UDAP/2.0 iPhone/4\r\n\r\n";
			
	    let message = new Buffer(ssdp_msg);

	    this._server.send(message, 0, message.length, ssdp_rport, ssdp_rhost);
	}
	
	_onServerMessage( message, host ) {
		message = message.toString();
		
		if( message.toLowerCase().indexOf('webos') === -1 ) return;
		
		let headers = WebOSScanner._parseHeaders( message );
		WebOSScanner._getInfo( headers['Location'], ( err, result ) => {
			if( err ) return console.error( err );
			
			let opts = {};
				opts.address = host.address;
				opts.id = result['UDN'].replace('uuid:', '');
				opts.name = result['modelName'];
				
			if( this._devices[ opts.id ] instanceof WebOSDevice ) return;
			
			this._devices[ opts.id ] = new WebOSDevice( opts );
	        this.emit('device', this._devices[ opts.id ]);
			
		});
		
		
	}
	
	static _parseHeaders( headers ) {
		headers = headers.split("\r\n");
			
		let result = {};
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
	
	static _getInfo( url, callback ) {
		callback = callback || function(){}
			
		return http.get(url, function(response) {
			
	        // Continuously update stream with data
	        let body = '';
	        response.on('data', function(d) {
	            body += d;
	        });
	        response.on('end', function() {
		        			
				let tags = [
					'deviceType',
					'friendlyName',
					'manufacturer',
					'manufacturerURL',
					'modelDescription',
					'modelName',
					'modelURL',
					'modelNumber',
					'UDN'
				]
				
				let result = {};
				tags.forEach(function(tag){
					result[ tag ] = WebOSScanner._getTextBetweenTags(tag, body)
				})
				
	            callback( null, result);
	        })
	        response.on('error', function(err){
		        callback(err);
	        })
	    });
	}
	
	static _getTextBetweenTags( tag, string ) {
		let re1 = new RegExp('<' + tag + '>(.*?)<\/' + tag + '>', 'g');
		let matches = string.match(re1);
		
		let re2 = new RegExp('<\/?' + tag + '>', 'g');
		if( matches ) return matches[0].replace(re2,'');
		return null;
	}
	
}

module.exports = WebOSScanner;