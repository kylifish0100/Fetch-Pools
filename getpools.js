const { ethers } = require('ethers');
const fs = require('fs');
const apiKey = '';

const provider = new ethers.AlchemyProvider("homestead", apiKey);
const eventSignature = ethers.id('PairCreated(address,address,address,uint256)'); //filter

// Standard ERC-20 Token ABI for the 'name' function
const tokenAbi = [
    "function name() view returns (string)"
  ];
  
let poolData = [];

async function processEvent(log) {
    const decoded = ethers.AbiCoder.defaultAbiCoder().decode(['address', 'uint256'], log.data);

    let token0 = log['topics'][1].toLowerCase();
    let token1 = log['topics'][2].toLowerCase();
    let pairAddress = decoded[0].toLowerCase();
    let poolIndex = decoded[1].toString();
    const pairContract = new ethers.Contract(pairAddress, tokenAbi, provider);
    const protocolName = await pairContract.name();

    let tokens = [token0, token1].sort();
    let poolInfo = {
        address: pairAddress,
        protocol: protocolName,
        tokens: tokens,
        factory: log.address.toLowerCase(),
        fee: 3000, // Standard Uniswap V2 fee
        createdInBlock: log.blockNumber,
        createdInTx: log.transactionHash.toLowerCase(),
        index: poolIndex
    };

    poolData.push(poolInfo);    

}

async function getPairCreatedEvents(startBlock, endBlock) {
    const batchSize = 2000; // Set a reasonable batch size
    let currentBlock = startBlock;

    while (currentBlock < endBlock) {
        const batchEndBlock = Math.min(currentBlock + batchSize, endBlock);

        console.log(`Fetching events from block ${currentBlock} to ${batchEndBlock}`);

        try {
            const logs = await provider.getLogs({
                fromBlock: currentBlock,
                toBlock: batchEndBlock,
                topics: [eventSignature]
            });

            for (const log of logs) {
                // console.log(log);
                await processEvent(log);
                
            }
        } catch (error) {
            console.error(`Error fetching events in block range ${currentBlock} to ${batchEndBlock}:`, error);
        }
        try {
            // Asynchronously write to the JSON file
            const json = JSON.stringify(poolData, null, 2);
            await fs.promises.writeFile('uniswapPools.json', json);
            // console.log('Data written to file');
        } catch (error) {
            console.error('Error processing event or writing to file:', error);
        }
        currentBlock += batchSize + 1; // Move to the next batch
    }
}
async function main(){
    const startBlock = 10000835; // the deployment block of the Uniswap V2 Factory
    let endBlock = await provider.getBlockNumber();
    await getPairCreatedEvents(startBlock, endBlock);
}
main().catch(console.error);


