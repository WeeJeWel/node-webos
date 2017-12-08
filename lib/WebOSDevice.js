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
			debug: false,
			timeout: 1000,
		}, opts);
		
		this._ws = null;
		this._reqQueue = [];
		this._reqRunning = false;
		this._messageCallbacks = {};
		this._cmdCount = 0;
		
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
	
	async _connect() {
		this._debug('_connect()')
		
		if( this._ws )
			throw new Error('Already connected');
		
		return new Promise(( resolve, reject ) => {
			
			this._registerMessageCallback( 'error', 'register_0', reject);
			this._registerMessageCallback( 'response', 'register_0', () => {})
			this._registerMessageCallback( 'registered', 'register_0', (err, payload) => {
				if( err ) return reject( err );
				
				// if key changed
				if( this._opts.key !== payload['client-key'] ) {
					this._opts.key = payload['client-key'];
					this.emit('key', this._opts.key);
				}
				
				resolve();
				
			});
			
			this._ws = new WebSocket(`ws://${this._opts.address}:${this._opts.port}`);
			this._ws
				.once('open', () => {
		
				    let handshake = require('./assets/hello.json');
				    	handshake.payload['client-key'] = this._opts.key;
					
					this._send( handshake );
					
				})
			    .on('error', ( err ) => {
				    reject( err );
				    this._debug(err);
				    
				    try {
						this._ws.close();
				    } catch( err ) {}
				    
				    this._ws = null;
			    })
			    .on('message', message => { 
					
					let err = null;
					let result = null;
					
					try {
						message = JSON.parse( message );
						if( message.error ) {
							err = new Error( result.error );
						} else if( message.payload ) {
							result = message.payload;
						}
					} catch( err_ ) {
						err = err_;
					}
					
					this._debug('_onWsMessage()', 'err', err, 'result', result);
						
					if( this._messageCallbacks[ message.id ]
					 && this._messageCallbacks[ message.id ][ message.type ] ) {						
						this._messageCallbacks[ message.id ][ message.type ].forEach( callback => callback( err, result ) );
						this._messageCallbacks[ message.id ][ message.type ] = [];
					} else {
						this._debug('Got unhandled message', message)
					}
			    		    
				});
				
		})
	}
	
	async _disconnect() {
		this._debug('_disconnect()')
		
		if( !this._ws )
			throw new Error('Not connected');
		
		return Promise.race([
			new Promise((resolve, reject) => {
				this._ws
					.once('close', () => {
						this._ws = null;
						resolve();
					})
					.close();
			}),
			new Promise((resolve, reject) => {					
				setTimeout(() => {
					reject( new Error('Timeout') );
				}, this._opts.timeout);
			})
		]);
		
	}
	
	async _req( uri, payload ) {
		return new Promise((resolve, reject) => {		
			this._reqQueue.push({
				uri: uri,
				payload: payload || null,
				resolve: resolve,
				reject: reject
			})
			this._reqNext();
		});
	}
	
	async _reqNext() {
		if( this._reqQueue.length === 0 ) return;
		if( this._reqRunning ) return;
			this._reqRunning = true;
		let nextReq = this._reqQueue.shift();
				
		let msg = {
		    id		: ++this._cmdCount,
		    type	: 'request',
		    uri		: nextReq.uri,
		    payload	: nextReq.payload
	    }
		
		let promise = this._connect()
			.then(() => {
				this._send( msg )
								
				return Promise.race([
					new Promise((resolve, reject) => {
						this._registerMessageCallback('response', msg.id, ( err, result ) => {
							if( err ) return reject( err );
							return resolve( result );
						});
					}),
					new Promise((resolve, reject) => {					
						setTimeout(() => {
							reject( new Error('Timeout') );
						}, this._opts.timeout);
					})
				])
			})
			.then( nextReq.resolve )
			.catch( nextReq.reject )
			.then( result => {
				return this._disconnect().catch(() => {})
			})
			.then(() => {
				process.nextTick(() => {
					this._reqRunning = false;
					this._reqNext();
				});				
			})
	}
	
	async _send( msg ) {
		this._debug('_send()');
		
		if( !this._ws )
			throw new Error('Not connected');
			
		this._ws.send(JSON.stringify(msg));
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