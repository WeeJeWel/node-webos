"use strict";

var util		= require('util');
var extend 		= require('util')._extend;
var events		= require('events');

var debug_log	= ( process.env.WEBOS_REMOTE_DEBUG == '1' );

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
	
	this.connected			= true;
	this.handshaken 		= false;
	
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
	this.cmd("channels_", "request", "ssap://tv/getChannelList", null, function(err, result) {
	    if( err ) return callback( err, null );
	    if( !Array.isArray(result.channelList) ) return callback( "invalid response", null );
	    	    
        // extract channel list
        var channels = result.channelList.map(function(channel){
	        return {
                id		: channel.channelId,
                name	: channel.channelName,
                number	: channel.channelNumber
            };
        })
        
        callback( null, channels );
	});
}

module.exports = Remote;