const { ethers } = require('ethers');
const fs = require('fs');
const uniswapV2FactoryABI = [{"inputs":[{"internalType":"address","name":"_feeToSetter","type":"address"}],"payable":false,"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"token0","type":"address"},{"indexed":true,"internalType":"address","name":"token1","type":"address"},{"indexed":false,"internalType":"address","name":"pair","type":"address"},{"indexed":false,"internalType":"uint256","name":"","type":"uint256"}],"name":"PairCreated","type":"event"},{"constant":true,"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"allPairs","outputs":[{"internalType":"address","name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"allPairsLength","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"tokenA","type":"address"},{"internalType":"address","name":"tokenB","type":"address"}],"name":"createPair","outputs":[{"internalType":"address","name":"pair","type":"address"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"feeTo","outputs":[{"internalType":"address","name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"feeToSetter","outputs":[{"internalType":"address","name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"internalType":"address","name":"","type":"address"},{"internalType":"address","name":"","type":"address"}],"name":"getPair","outputs":[{"internalType":"address","name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"_feeTo","type":"address"}],"name":"setFeeTo","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"_feeToSetter","type":"address"}],"name":"setFeeToSetter","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"}]; // Add Uniswap V2 Factory ABI here
const uniswapV2FactoryAddress = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'; 
const apiKey = '';

const provider = new ethers.AlchemyProvider("homestead", apiKey);
const eventSignature = ethers.id('PairCreated(address,address,address,uint256)'); //filter

// const factoryContract = new ethers.Contract(uniswapV2FactoryAddress, uniswapV2FactoryABI, provider);

let poolData = [];

async function processEvent(log) {
    const decoded = ethers.AbiCoder.defaultAbiCoder().decode(['address', 'uint256'], log.data);

    let token0 = log['topics'][1].toLowerCase();
    let token1 = log['topics'][2].toLowerCase();
    let pairAddress = decoded[0].toLowerCase();
    let poolIndex = decoded[1].toString();

    let tokens = [token0, token1].sort();
    let poolInfo = {
        address: pairAddress,
        protocol: "Uniswap V2",
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
            console.log('Data written to file');
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


