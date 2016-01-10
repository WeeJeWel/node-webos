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
		address			: 'smarttv.lan',
		port			: 3000,
		key				: false,
		connectTimeout	: 10000
	}, opts);
	
	this.connected				= false;
	this.handshaken 			= false;
	
	var WebSocketClient 		= require('websocket').client;
	this.wsclient 				= new WebSocketClient();
	this.wsconnection			= undefined;
	this.command_count			= 0;
	this.onConnectCallback	 	= false;
	this.onDisconnectCallback 	= false;
	this.connectTimeout			= undefined;
	
	this.wsclient.on('connect', function(connection) {	
	    debug('wsclient.onConnect');
	    
		if( this.connectTimeout ) clearTimeout(this.connectTimeout);
		
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
	wsclient connection listeners
*/
function onError( error ){
    debug("connection.onError", error);
    this.emit('error', error);	
}

function onClose() {
    debug('connection.onClose');
    this.wsconnection = undefined;
	this.handshaken = false;
	this.connected = false;
    this.emit("disconnect");
    
    if( typeof this.onDisconnectCallback == 'function' ) {
	    this.onDisconnectCallback( null, true );
    }
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
	
	if( typeof this.opts.connectTimeout == 'number' ) {
		if( this.connectTimeout ) clearTimeout(this.connectTimeout);
		this.connectTimeout = setTimeout(function(){
			if( typeof this.onConnectCallback == 'function' ) {
				this.onConnectCallback( "timeout", null );
				this.onConnectCallback = false;
			}
		}.bind(this), this.opts.connectTimeout);
	}
	
	if( typeof callback == 'function' ) {
		this.onConnectCallback = callback;
	}
}

/*
	Disconnect from a device
*/
Remote.prototype.disconnect = function( callback ){	
	if( typeof callback == 'function' ) {
		this.onDisconnectCallback = callback;
	}
	
	this.wsconnection.close();
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
}

/*
	From now on only TV Commands will follow
*/

/*
	Get an array of inputs
*/
Remote.prototype.getInputs = function( callback ) {
	callback = callback || function(){}
	
	this.cmd("input_", "request", "ssap://tv/getExternalInputList", null, function(err, result) {
		if( err ) return callback( err, null );
		callback( null, result.devices );
	});
}

/*
	Get the current input
*/
Remote.prototype.getInput = function( callback ) {
	callback = callback || function(){}
	
	// TODO
	callback( "not implemented", null );
}

/*
	Set the current input
*/
Remote.prototype.setInput = function( inputId, callback ) {
	callback = callback || function(){}
	
	this.cmd("", "request", "ssap://tv/switchInput", {
		inputId: inputId
	}, callback);
}

/*
	Get an array of channels
*/
Remote.prototype.getChannels = function( callback ) {
	callback = callback || function(){}
	
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

/*
	Get the current channel
*/
Remote.prototype.getChannel = function( callback ) {
	callback = callback || function(){}
	
	this.cmd("channels_", "request", "ssap://tv/getCurrentChannel", null, function( err, channel ){
		if( err ) return callback( err, null );
		if( channel.errorText ) return callback( channel.errorText, null );
		
		callback( null, {
            id		: channel.channelId,
            name	: channel.channelName,
            number	: channel.channelNumber
		})
	});	
}

/*
	Set the current channel
*/
Remote.prototype.setChannel = function( channel, callback ) {
	callback = callback || function(){}
	
	this.cmd("", "request", "ssap://tv/openChannel", {
		channelId: channel
	}, callback);	
}

/*
	Get the volume
*/
Remote.prototype.getVolume = function( callback ) {
	callback = callback || function(){}
	
	this.cmd("status_", "request", "ssap://audio/getVolume", null, callback);
}

/*
	Set the volume
*/
Remote.prototype.setVolume = function( volume, callback ) {
	callback = callback || function(){}
	
	this.cmd("", "request", "ssap://audio/setVolume", {
		volume: volume
	}, callback);
}

/*
	Get mute
*/
Remote.prototype.getMute = function( callback ) {
	callback = callback || function(){}
	
	this.cmd("status_", "request", "ssap://audio/getStatus", null, function( err, payload ){
		if( err ) return callback( err, null );
		callback( null, payload.mute );
	});
}

/*
	Set mute
*/
Remote.prototype.setMute = function( mute, callback ) {
	callback = callback || function(){}
	
	this.cmd("", "request", "ssap://audio/setMute", {
		mute: mute
	}, callback);
}

/*
	Get Apps
*/
Remote.prototype.getApps = function( callback ) {
	callback = callback || function(){}
	
	this.cmd("launcher_", "request", "ssap://com.webos.applicationManager/listLaunchPoints", null, function(err, result) {
		if( err ) return callback( err, null );
		callback( result.launchPoints );
	});
}

/*
	Start an App
*/
Remote.prototype.openApp = function( id, params, callback ) {
	callback = callback || function(){}
	params = params || {};
	
	this.cmd("launcher_", "request", "ssap://system.launcher/launch", {
		id		: id,
		params	: params
	}, function(err, result) {
		if( err ) return callback( err, null );
		callback( null, result );
	});
}

/*
	Close an App
*/
Remote.prototype.closeApp = function( id, callback ){
	callback = callback || function(){}
	
	this.cmd("", "request", "ssap://system.launcher/close", {
		id: id
	}, callback);
}

/*
	Show a float message
*/
Remote.prototype.showFloat = function(message, callback) {
	callback = callback || function(){}
	
	this.cmd("", "request", "ssap://system.notifications/createToast", {
		message: message
	}, callback);
}

/*
	Get software info
*/
Remote.prototype.getSoftwareInfo = function(callback) {
	callback = callback || function(){}
	
	this.cmd("sw_info_", "request", "ssap://com.webos.service.update/getCurrentSWInformation", null, callback);
}

/*
	Turn the TV off
*/
Remote.prototype.turnOff = function( callback ) {
	callback = callback || function(){}
	
	this.cmd("", "request", "ssap://system/turnOff", null, callback);
}

module.exports = Remote;