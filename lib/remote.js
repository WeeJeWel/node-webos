"use strict";

var util		= require('util');
var events		= require('events');

var WebSocket 	= require('ws');

function Remote( opts ) {

	opts = opts || {};

	this.opts = util._extend({
		address				: 'smarttv.lan',
		port				: 3000,
		key					: false,
		connectTimeout		: 10000,
		debug				: false,
		reconnect			: true,
		reconnectTimeout	: 5000,
		reconnectFromStart	: false
	}, opts);

	this.connected				= false;
	this.handshaken 			= false;

	this.ws 					= undefined;
	this.command_count			= 0;
	this.onConnectCallback	 	= false;
	this.onDisconnectCallback 	= false;
	this.connectTimeout			= undefined;
	this.reconnectInterval		= undefined;
	this.reconnecting			= false;

}
util.inherits( Remote, events.EventEmitter );

Remote.prototype.debug = function() {
	if( this.opts.debug ) {
		console.log.bind( null, '[debug:Remote]' ).apply(null, arguments);
	}
}

/*
	wsclient connection listeners
*/
function onOpen() {
    this.debug('onOpen');

	if( this.connectTimeout ) clearTimeout(this.connectTimeout);
	if( this.reconnectInterval ) clearInterval(this.reconnectInterval);

	this.connected = true;
    this.handshaken = false;

    // if key provided, authorise, else, get one
    var handshake = require('./assets/hello.json');

    if( this.opts.key ) {
	    handshake.payload['client-key'] = this.opts.key;
	}

	this.debug('sending handshake');
	this.ws.send(JSON.stringify(handshake));
}

function onClose() {
    this.debug('onClose');

    if( this.connected ) {
	    this.emit("disconnect");
    }

	this.handshaken = false;
	this.connected = false;

    if( typeof this.onDisconnectCallback == 'function' ) {
	    this.onDisconnectCallback( null, true );
	    this.onDisconnectCallback = false;
    }

    this._reconnect();
}

function onError( error ){
    this.debug("onError", error);
    if( typeof this.onConnectCallback == 'function' ) {

		if( this.opts.reconnectFromStart ) {
			this._reconnect();
		} else {
			this.onConnectCallback( error );
			this.onConnectCallback = false;
		}

	} else {
    	this.emit('error', error);
    }
}

function onMessage(message) {
    var json = JSON.parse(message);
    this.debug('onMessage', json);
    this.emit(json.id, json);

    if( typeof this.onConnectCallback == 'function' && json.id == 'register_0' ) {
        if( json.type == 'registered' ) {
	        this.handshaken = true;

	        if( this.reconnecting ) {
		        this.emit('reconnect');
	        } else {
		        this.onConnectCallback( null, json.payload['client-key'] );
		        this.onConnectCallback = false;
	        }
	    } else if( json.type == 'error' ) {
		    this.onConnectCallback( json.error, null );
		    this.onConnectCallback = false;
	    }
    }
}

/*
	Connect to a device
*/
Remote.prototype._reconnect = function(){

    if( this.opts.reconnect == true && typeof this.reconnectInterval === 'undefined' ) {
	    this.reconnecting = true;
	    this.reconnectInterval = setInterval(function(){
		    this.debug('reconnecting');
		    this.connect();
	    }.bind(this), this.opts.reconnectTimeout);
    }

}

Remote.prototype.connect = function( opts, callback ) {
	opts = opts || {};
	callback = callback || function(){}

	if( typeof opts.address == 'string' ) 	this.opts.address = opts.address;
	if( typeof opts.key == 'string' ) 		this.opts.key = opts.key;

	this.debug('connecting to', this.opts.address)
	this.ws = new WebSocket( 'ws://' + this.opts.address + ':' + this.opts.port );

	this.ws
		.on('open', onOpen.bind(this))
	    .on('error', onError.bind(this))
	    .on('close', onClose.bind(this))
	    .on('message', onMessage.bind(this))

	if( typeof this.opts.connectTimeout == 'number' ) {
		if( this.connectTimeout ) clearTimeout(this.connectTimeout);
		this.connectTimeout = setTimeout(function(){
			if( typeof this.onConnectCallback == 'function' ) {
				if( this.opts.reconnectFromStart ) {
					this._reconnect();
				} else {
					this.onConnectCallback( new Error("timeout") );
					this.onConnectCallback = false;
				}
			}
		}.bind(this), this.opts.reconnectTimeout);
	}

	if( typeof callback == 'function' && this.onConnectCallback === false ) {
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

	this.ws.close();
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
        this.ws.send(JSON.stringify(msg));

    } catch (err) {
        this.debug('cmd.onError', err.stack);
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