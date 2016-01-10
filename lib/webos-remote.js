"use strict";

var util		= require('util');
var extend 		= require('util')._extend;
var events		= require('events');
var dgram 		= require('dgram');

var debug_log	= true;

function debug() {
	if( !debug_log ) return;
	console.log.apply(null, arguments);
}

function Remote( opts ) {
	
	opts = opts || {};
	
	this.opts = extend({
		address		: 'smarttv.lan',
		port		: 3000,
		key			: false
	}, opts);
	
	this.scanning 			= false;
	this.connected			= true;
	this.handshaken 		= false;
	this.foundDevices 		= [];
	
	var WebSocketClient 	= require('websocket').client;
	this.wsclient 			= new WebSocketClient();
	this.wsconnection		= undefined;
	this.command_count		= 0;
	this.onConnectCallback 	= false;
	
	this.wsclient.on('connect', function(connection) {
	    debug('wsclient.onConnect');
		
		this.connected = true;
	    this.handshaken = false;
		this.wsconnection = connection;

	    connection
		    .on('error', onError.bind(this))		    
		    .on('close', onClose.bind(this))
		    .on('message', onMessage.bind(this))
	    
	    // if key provided, authorise, else, get one
	    var handshake = require('./assets/hello.json');
	    
	    if( this.opts.key ) {
		    handshake.payload['client-key'] = this.opts.key;
		}
		
		debug('sending handshake');
		connection.send(JSON.stringify(handshake));

	}.bind(this));
	
}
util.inherits( Remote, events.EventEmitter );

/*
	connection listeners
*/
function onError( error ){
    debug("connection.onError", error);
    this.emit('error', error);	
}

function onClose() {
    debug('connection.onClose');
    this.wsconnection = undefined;
	this.connected = false;
    this.emit("disconnect");
}

function onMessage(message) {
    if (message.type === 'utf8') {
        var json = JSON.parse(message.utf8Data);
        debug('connection.onMessage', json);
        this.emit(json.id, json);
        
        if( typeof this.onConnectCallback == 'function' && json.id == 'register_0' ) {
	        if( json.type == 'registered' ) {
		        this.handshaken = true;
		        this.onConnectCallback( null, json.payload['client-key'] );
		    } else if( json.type == 'error' ) {
			    this.onConnectCallback( json.error, null );
		    }
        }
        
    } else {
        debug('connection.onMessage', message.toString());
    }
}

/*
	Connect to a device
*/
Remote.prototype.connect = function( opts, callback ) {
	opts = opts || {};
	
	if( typeof opts.address == 'string' ) 	this.opts.address = opts.address;
	if( typeof opts.key == 'string' ) 		this.opts.key = opts.key;
	
	debug('connecting to', opts.address)
	this.wsclient.connect( 'ws://' + this.opts.address + ':' + this.opts.port );
	
	if( typeof callback == 'function' ) {
		this.onConnectCallback = callback;
	}
}

/*
	Disconnect from a device
*/
Remote.prototype.disconnect = function(){
	// TODO
	this.handshaken = false;
}

/*
	Start scanning for TVs
*/
Remote.prototype.startScanning = function() {
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
		    
	        this.emit('discover', device)
		}.bind(this))
		
		// listen to 0.0.0.0:random
		.bind()
	
}

/*
	Stop scanning for TVs
*/
Remote.prototype.stopScanning = function() {
	if( this.scanning !== true ) return new Error("not scanning");
	
	this.scanning = false;
	this.foundDevices = [];
	this.server.close();
}

/*
	Send a command
*/
Remote.prototype.cmd = function(prefix, type, uri, payload, callback) {
	
	if( !this.connected ) return callback( "not connected", null );
	if( !this.handshaken ) return callback( "not handshaken", null );
	
    this.command_count++;
    
    var msg = {
	    id		: prefix + this.command_count,
	    type	: type,
	    uri		: uri,
	    payload	: payload
    }

    try {
        if( typeof callback === 'function' ) {
            this.once(msg.id, function(message) {
                //console.log('send_command.onMessage', msg.id, message); 
                callback(null, message.payload);
            });
        }
        this.wsconnection.send(JSON.stringify(msg));

    } catch (err) {
        debug('send_command.onError', err.stack);
        if( typeof callback === 'function' ) {
            callback(err, null);
        }
    }
};

/*
	Show a float message
*/
Remote.prototype.show_float = function(message, callback) {
	this.cmd("", "request", "ssap://system.notifications/createToast", {
		message: message
	}, callback);
}

Remote.prototype.getChannels = function( callback ) {
	
}

module.exports = Remote;

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

/*
	Helper variables
*/
// ?