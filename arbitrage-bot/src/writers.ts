import type { CheckpointWriter } from '@snapshot-labs/checkpoint';
import {
  convertToDecimal,
  getEvent,
  loadPair,
  Pair,
  updatePair,
  synced,
  createPair
} from './utils/utils';

export async function handleSync({ block, tx, rawEvent, mysql }: Parameters<CheckpointWriter>[0]) {
  try {
    if (!rawEvent) {
      return;
    }

    const format = 'reserve0, low, reserve1, low';
    const data: any = getEvent(rawEvent.data, format);

    // Load or create the pairs
    const pairIds = [
      process.env.SITSWAP_PAIR!,
      process.env.TENK_PAIR!,
      process.env.JEDISWAP_PAIR!
    ];

    let pairs: { [key: string]: any } = [];

    // Store pair if it doesnt exist else we load it
    for (const key in pairIds) {
      if (pairIds[key] == rawEvent.from_address) {
        let pair: any = await loadPair(pairIds[key], mysql);
        if (!pair) {
          pair = {
            id: pairIds[key],
            reserve0: 0,
            reserve1: 0,
            price: 0,
            timestamp: block!.timestamp,
            synced: block!.block_number,
            tx: tx.transaction_hash!
          };
          await createPair(pair, mysql);
        }
        pairs[key] = pair;
      }
    }
    
    // Update reserves and calculate the prices for each pair
    for (const key in pairs) {
      if (pairIds[key] == rawEvent.from_address) {
        pairs[key].reserve0 = convertToDecimal(data.reserve0, 18);
        pairs[key].reserve1 = convertToDecimal(data.reserve1, 6);
        pairs[key].price = pairs[key].reserve1 / pairs[key].reserve0;
        console.log(`${key} price:`, pairs[key].price);
      }
    }

    // Find arbitrage opportunities and execute trades
    let detected = find(pairs);
    if (detected) {
      console.log(`Arbitrage opportunity found: ${detected}`);
      if (await synced(block?.block_number)) {
        console.log(`Starknet state fully synced on block: ${block?.block_number}`)
        console.log(`Swapping`)
        // Insert your swap method here
      }
    }

    // Update the pair and save it in the database
    for (const key in pairs) {
      if (pairIds[key] == rawEvent.from_address) {
        pairs[key].timestamp = block!.timestamp;
        pairs[key].synced = block!.block_number;
        pairs[key].tx = tx.transaction_hash!;
        await updatePair(pairs[key], mysql);
      }
    }
  } catch (err) {
    console.log(err)
  }
  }

function find(pairs: { [key: string]: any }): string | null {
    const threshold = 0.001; // threshold for an arbitrage opportunity (here 1%)

    const pairNames = Object.keys(pairs);
    for (let i = 0; i < pairNames.length; i++) {
      for (let j = i + 1; j < pairNames.length; j++) {
        const pair1 = pairs[pairNames[i]];
        const pair2 = pairs[pairNames[j]];

        const priceDifference = Math.abs(pair1.price - pair2.price);
        const percentageDifference = priceDifference / Math.min(pair1.price, pair2.price);
        if (percentageDifference >= threshold) {
          return `${pairNames[i]}-${pairNames[j]}: ${percentageDifference * 100}%`;
        }
      }
    }

    return null;
} 
