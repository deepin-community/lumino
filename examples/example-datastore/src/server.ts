// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.
/*-----------------------------------------------------------------------------
| Copyright (c) 2019, PhosphorJS Contributors
|
| Distributed under the terms of the BSD 3-Clause License.
|
| The full license is in the file LICENSE, distributed with this software.
|----------------------------------------------------------------------------*/
import { Datastore } from '@lumino/datastore';

import { connection, server as WebSocketServer } from 'websocket';

import { WSAdapterMessages } from './messages';

import * as fs from 'fs';

import * as http from 'http';

import * as path from 'path';

/**
 * Create a HTTP static file server for serving the static
 * assets to the user.
 */
let server = http.createServer((request, response) => {
  console.log('request starting...');

  let filePath = '.' + request.url;
  if (filePath == './') {
    filePath = './index.html';
  }

  let extname = path.extname(filePath);
  let contentType = 'text/html';
  switch (extname) {
    case '.js':
      contentType = 'text/javascript';
      break;
    case '.css':
      contentType = 'text/css';
      break;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      console.error('Could not find file');
      response.writeHead(404, { 'Content-Type': contentType });
      response.end();
    } else {
      response.writeHead(200, { 'Content-Type': contentType });
      response.end(content, 'utf-8');
    }
  });
});

// Start the server
server.listen(8000, () => {
  console.info(new Date() + ' Page server is listening on port 8000');
});

// Create a websocket server for communication of transactions.
let wsServer = new WebSocketServer({
  httpServer: server,
  autoAcceptConnections: false,
  maxReceivedFrameSize: 10 * 1024 * 1024,
  maxReceivedMessageSize: 1000 * 1024 * 1024
});

/**
 * A stub for determining whether websocket connections from a particular
 * origin should be accepted.
 */
function originIsAllowed(origin: string) {
  // put logic here to detect whether the specified origin is allowed.
  return true;
}

/**
 * A patch store for the server.
 */
class TransactionStore {
  /**
   * Construct a new patch store.
   */
  constructor() {
    this._transactions = {};
    this._order = [];
  }

  /**
   * Add a transaction to the patch store.
   *
   * @param The transaction to add to the store.
   *
   * @returns whether it was successfully added.
   */
  add(transaction: Datastore.Transaction): boolean {
    if (this._transactions.hasOwnProperty(transaction.id)) {
      return false;
    }
    this._transactions[transaction.id] = transaction;
    this._order.push(transaction.id);
    let count = this._cemetery[transaction.id];
    if (count === undefined) {
      this._cemetery[transaction.id] = 1;
    } else {
      this._cemetery[transaction.id] = count + 1;
    }
    return true;
  }

  /**
   * Get a transaction by id.
   *
   * @param transactionId: the id of the transaction.
   *
   * @returns the transaction, or undefined if it can't be found.
   */
  get(transactionId: string): Datastore.Transaction | undefined {
    return this._transactions[transactionId];
  }

  /**
   * Handle a transaction undo.
   *
   * @param transactionId - the ID of the transaction to undo.
   *
   * #### Notes
   * This has no effect on the content of the transaction. Instead, it
   * updates its undo count in the internal cemetery, determining whether
   * the transaction should be applied at any given time.
   */
  undo(transactionId: string): void {
    let count = this._cemetery[transactionId];
    if (count === undefined) {
      this._cemetery[transactionId] = -1;
    } else {
      this._cemetery[transactionId] = count - 1;
    }
  }

  /**
   * Handle a transaction redo.
   *
   * @param transactionId - the ID of the transaction to redo.
   *
   * #### Notes
   * This has no effect on the content of the transaction. Instead, it
   * updates its undo count in the internal cemetery, determining whether
   * the transaction should be applied at any given time.
   */
  redo(transactionId: string): void {
    let count = this._cemetery[transactionId];
    if (count === undefined) {
      this._cemetery[transactionId] = 0;
    } else {
      this._cemetery[transactionId] = count + 1;
    }
  }

  /**
   * Get the entire history for the transaction store.
   *
   * @returns an array of transactions representing the whole history.
   */
  getHistory(): Datastore.Transaction[] {
    let history = [];
    for (let id of this._order) {
      let count = this._cemetery[id] || 0;
      if (count > 0) {
        history.push(this._transactions[id]);
      }
    }
    return history;
  }

  private _order: string[];
  private _transactions: { [id: string]: Datastore.Transaction };
  private _cemetery: { [id: string]: number } = {};
}

// Create a transaction store.
let store = new TransactionStore();
let idCounter = 0;

// Keep a running list of current connections.
let connections: { [store: number]: connection } = {};

// Lifecycle for a collaborator.
wsServer.on('request', request => {
  if (!originIsAllowed(request.origin)) {
    // Make sure we only accept requests from an allowed origin
    request.reject();
    console.info(
      new Date() + ' Connection from origin ' + request.origin + ' rejected.'
    );
    return;
  }

  let connection = request.accept(undefined, request.origin);
  console.debug(new Date() + ' Connection accepted.');

  // Handle a message from a collaborator.
  connection.on('message', message => {
    // Only allow UTF-8 encoded messages.
    if (message.type !== 'utf8') {
      console.debug('Received non-UTF8 Message: ' + message);
      return;
    }
    let data = JSON.parse(message.utf8Data!) as WSAdapterMessages.IMessage;
    console.debug(`Received message of type: ${data.msgType}`);
    let reply: WSAdapterMessages.IReplyMessage;
    let transaction: Datastore.Transaction | undefined;

    switch (data.msgType) {
      case 'storeid-request':
        connections[idCounter] = connection;
        reply = WSAdapterMessages.createStoreIdReplyMessage(
          data.msgId,
          idCounter++
        );
        break;
      case 'transaction-broadcast':
        let acks = [];
        let propagate = [];
        for (let t of data.content.transactions) {
          if (store.add(t)) {
            acks.push(t.id);
            propagate.push(t);
          }
        }
        let propMsgStr = JSON.stringify(
          WSAdapterMessages.createTransactionBroadcastMessage(propagate)
        );
        // Broadcast the transaction to all the other collaborators
        for (let storeId in connections) {
          let c = connections[storeId];
          if (c !== connection) {
            console.debug(`Broadcasting transactions to: ${storeId}`);
            c.sendUTF(propMsgStr);
          }
        }
        reply = WSAdapterMessages.createTransactionAckMessage(data.msgId, acks);
        break;
      case 'undo-request':
        transaction = store.get(data.content.transactionId);
        if (!transaction) {
          return;
        }
        // Mark the transaction as undone in the datastore, which decrements
        // its count in the cemetery.
        store.undo(transaction.id);
        reply = WSAdapterMessages.createUndoReplyMessage(
          data.msgId,
          transaction
        );
        // Broadcast the undo reply to all the other collaborators
        for (let storeId in connections) {
          let c = connections[storeId];
          if (c !== connection) {
            console.debug(`Broadcasting undo to: ${storeId}`);
            c.sendUTF(JSON.stringify(reply));
          }
        }
        break;
      case 'redo-request':
        transaction = store.get(data.content.transactionId);
        if (!transaction) {
          return;
        }
        // Mark the transaction as redone in the datastore, which increments
        // its count in the cemetery.
        store.redo(transaction.id);
        reply = WSAdapterMessages.createRedoReplyMessage(
          data.msgId,
          transaction
        );
        // Broadcast the undo reply to all the other collaborators
        for (let storeId in connections) {
          let c = connections[storeId];
          if (c !== connection) {
            console.debug(`Broadcasting redo to: ${storeId}`);
            c.sendUTF(JSON.stringify(reply));
          }
        }
        break;
      case 'history-request':
        let history = store.getHistory();
        reply = WSAdapterMessages.createHistoryReplyMessage(data.msgId, {
          transactions: history
        });
        break;
      default:
        return;
    }
    console.debug(`Sending reply: ${reply.msgType}`);
    connection.sendUTF(JSON.stringify(reply));
  });

  // Handle a close event from a collaborator.
  connection.on('close', (reasonCode, description) => {
    let storeId;
    for (let id in connections) {
      if (connections[id] === connection) {
        storeId = id;
      }
    }
    console.debug(
      new Date() +
        ` Store ID ${storeId} disconnected. Reason: ${reasonCode}: ${description}`
    );
    for (let id in connections) {
      if (connections[id] === connection) {
        delete connections[id];
        break;
      }
    }
  });
});
