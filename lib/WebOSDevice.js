'use strict';

const events = require('events');

const WebSocket = require('ws');

class WebOSDevice extends events.EventEmitter {
	
	constructor( opts ) {
		super();
		
		this._opts = Object.assign({
			host: 'smarttv.lan',
			port: 3000,
			key: '',
			debug: true
		}, opts);
		
		this._queue = [];
		this._queueItem = null;
		this._messageCallbacks = {};
		this._cmdCount = 0;
		this._state = 'disconnected';
		
	}
	
	_debug() {
		if( this._opts.debug ) {
			console.log.apply( null, arguments );
		}
	}
	
	_registerMessageCallback( type, callback ) {		
		this._messageCallbacks[type] = this._messageCallbacks[type] || [];
		this._messageCallbacks[type].push( callback );
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
			
			this._registerMessageCallback( 'error', err => {
			    this._state = 'disconnected';				    
				reject( err );
		    });
			this._registerMessageCallback( 'response', () => {})
			this._registerMessageCallback( 'registered', payload => {
				
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
				
				    if( this._opts.key ) {
					    handshake.payload['client-key'] = this._opts.key;
					}
					
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
										
					if( !Array.isArray(this._messageCallbacks[ message.type ])
					 || this._messageCallbacks[ message.type ].length < 1 )
						return this._queueReject( new Error('no_listeners') );
						
					this._messageCallbacks[ message.type ].forEach( callback => callback( message.payload ) );
					this._messageCallbacks[ message.type ] = [];
			    		    
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
	
	_req( prefix, uri, payload ) {
		return new Promise( ( resolve, reject ) => {
			
			this._queue.push({
				prefix: prefix,
				uri: uri,
				payload: payload,
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
			    id		: this._queueItem.prefix + (++this._cmdCount),
			    type	: 'request',
			    uri		: this._queueItem.uri,
			    payload	: this._queueItem.payload
		    }
		    
		    try {
				this._registerMessageCallback('response', this._queueResolve.bind(this))
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
	
	/*
		Methods
	*/
	showFloat( message ) {
		return this._req( '', 'ssap://system.notifications/createToast', {
			message: message
		});
	}
	
}

module.exports = WebOSDevice;