'use strict';

const events = require('events');

const WebSocket = require('ws');

class WebOSDevice extends events.EventEmitter {
	
	constructor( opts ) {
		super();
		
		this._opts = Object.assign({
			address: 'smarttv.lan',
			port: 3000,
			key: '',
			debug: false
		}, opts);
		
		this._queue = [];
		this._queueItem = null;
		this._messageCallbacks = {};
		this._cmdCount = 0;
		this._state = 'disconnected';
		
	}
	
	setKey( key ) {
		this._opts.key = key;
	}
	
	_debug() {
		if( this._opts.debug ) {
			console.log.apply( null, arguments );
		}
	}
	
	_registerMessageCallback( type, msgId, callback ) {		
		this._messageCallbacks[msgId] = this._messageCallbacks[msgId] || {};
		this._messageCallbacks[msgId][type] = this._messageCallbacks[msgId][type] || [];
		this._messageCallbacks[msgId][type].push( callback );
	}
	
	_connect() {
		this._debug('_connect()')
		
		if( this._state === 'connected' )
			return Promise.resolve();
			
		if( this._state === 'connecting' )
			return new Promise( resolve => {
				this.once('_connected', resolve);
			});
		
		this._state = 'connecting';
		
		return new Promise(( resolve, reject ) => {
			
			this._registerMessageCallback( 'error', 'register_0', err => {
			    this._state = 'disconnected';		
				reject( new Error(err || 'unknown_error') );
		    });
			this._registerMessageCallback( 'response', 'register_0', () => {})
			this._registerMessageCallback( 'registered', 'register_0', payload => {
				
				// if key changed
				if( this._opts.key !== payload['client-key'] ) {
					this._opts.key = payload['client-key'];
					this.emit('key', this._opts.key);
				}
				
				this._state = 'connected';
				this.emit('_connected');
				
				resolve();
				
			});
			
			this._ws = new WebSocket( 'ws://' + this._opts.address + ':' + this._opts.port );	
			this._ws
				.once('open', () => {
		
				    let handshake = require('./assets/hello.json');
				    	handshake.payload['client-key'] = this._opts.key;
					
					this._send( handshake );
					
				})
			    .once('error', err => {
				    this._state = 'disconnected';				    
					reject( err );
			    })
			    .on('message', message => { 
					this._debug('_onWsMessage()', message);
				
					try {
						message = JSON.parse( message );
					} catch( err ) {
						return this._queueReject( err );
					}
										
					if( typeof this._messageCallbacks[ message.id ] !== 'object'
					 || !Array.isArray(this._messageCallbacks[ message.id ][ message.type ])
					 || this._messageCallbacks[ message.id ][ message.type ].length < 1 )
						return this._queueReject( new Error('no_listeners') );
						
					this._messageCallbacks[ message.id ][ message.type ].forEach( callback => callback( message.error || message.payload ) );
					this._messageCallbacks[ message.id ][ message.type ] = [];
			    		    
				});
				
		});
	}
	
	_disconnect() {
		this._debug('_disconnect()')
		
		if( this._state === 'disconnected' )
			return Promise.resolve();
			
		if( this._state === 'disconnecting' )
			return new Promise( resolve => {
				this.once('_disconnected', resolve);
			});
			
		this._state = 'disconnecting';
		
		return new Promise((resolve, reject) => {
			this._ws
				.once('close', () => {
					this._state = 'disconnected';
					this.emit('_disconnected');
					resolve();
				})
				.close();
		});
		
	}
	
	_req( uri, payload ) {
		return new Promise( ( resolve, reject ) => {
			
			this._queue.push({
				uri: uri,
				payload: payload || null,
				resolve: resolve,
				reject: reject
			});
			
			this._queueStep();			
			
		});
	}
	
	_send( msg ) {
		this._debug('_send()');
		
		return this._ws.send(JSON.stringify(msg));
	}
	
	_queueStep() {
		this._debug('_queueStep()');
		
		if( this._queueItem ) return;
		if( this._queue.length < 1) return;
		
		this._queueItem = this._queue.shift();
		
		this._connect()
			.then( this._queueSend.bind(this) )
			.then( this._queueResolve.bind(this) )
			.catch( this._queueReject.bind(this) )
		
	}
	
	_queueSend() {
		this._debug('_queueSend()');
		
		return new Promise(( resolve, reject ) => {
		
		    let msg = {
			    id		: ++this._cmdCount,
			    type	: 'request',
			    uri		: this._queueItem.uri,
			    payload	: this._queueItem.payload
		    }
		    
		    try {
				this._registerMessageCallback('response', msg.id, this._queueResolve.bind(this))
				this._registerMessageCallback('error', msg.id, this._queueReject.bind(this))
		        this._send( msg );
		    } catch( err ) {
		    	this._queueReject( err );
		    }
		});
	}
	
	_queueReject( err ) {
		this._debug('_queueReject()')
		
		if( this._queueItem ) {	
			this._queueItem.reject( err );
			this._queueItem = null;	
		}		
		this._queueStep();
	}
	
	_queueResolve( result ) {
		this._debug('_queueResolve()')
		
		if( this._queueItem ) {	
			this._queueItem.resolve( result );
			this._queueItem = null;	
		}
		
		if( this._disconnectTimeout )
			clearTimeout(this._disconnectTimeout);
			
		this._disconnectTimeout = setTimeout(() => {		
			this._disconnect()
				.then( this._queueStep.bind(this) )
				.catch( this._queueStep.bind(this) )	
		}, 5000)
		
		this._queueStep();
		
	}
	
	getOpt( key ) {
		return this._opts[ key ];
	}
	
	setOpt( key, value ) {
		this._opts[ key ] = value;
	}
	
	/*
		Methods
	*/

	getVolume() {
		this._debug('getVolume');
		
		return this._req('ssap://audio/getVolume');
	}

	setVolume( volume ) {
		this._debug('setVolume', volume);
		
		return this._req('ssap://audio/setVolume', {
			volume: volume
		});
	}

	getMute() {
		this._debug('getMute');
		
		return this._req('ssap://audio/getStatus')
			.then( result => {
				return result.mute;
			})
	}

	setMute( muted ) {
		this._debug('setMute', muted);
		
		return this._req('ssap://audio/setMute', {
			mute: muted
		});
	}
	
	createToast( message ) {
		return this._req('ssap://system.notifications/createToast', {
			message: message
		});
	}
	
	getChannels() {
		return this._req('ssap://tv/getChannelList')
			.then( result => {
				if( !Array.isArray(result.channelList) )
					throw new Error('invalid_response');
					
				return result.channelList.map( channel => {
			        return {
		                id		: channel.channelId,
		                name	: channel.channelName,
		                number	: parseInt(channel.channelNumber)
		            };
		        })
			});
	}
	
	setChannel( channelId ) {
		return this._req('ssap://tv/openChannel', {
			channelId: channelId
		});
	}
	
	getInputs() {
		return this._req('ssap://tv/getExternalInputList')
			.then( result => {
				return result.devices;
			});		
	}
	
	setInput( inputId ) {
		return this._req('ssap://tv/switchInput', {
			inputId: inputId
		});
	}
	
	turnOff() {
		return this._req('ssap://system/turnOff');
	}
}

module.exports = WebOSDevice;