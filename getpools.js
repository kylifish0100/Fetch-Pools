const { ethers } = require('ethers');
const fs = require('fs');
const uniswapV2FactoryABI = [{"inputs":[{"internalType":"address","name":"_feeToSetter","type":"address"}],"payable":false,"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"token0","type":"address"},{"indexed":true,"internalType":"address","name":"token1","type":"address"},{"indexed":false,"internalType":"address","name":"pair","type":"address"},{"indexed":false,"internalType":"uint256","name":"","type":"uint256"}],"name":"PairCreated","type":"event"},{"constant":true,"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"allPairs","outputs":[{"internalType":"address","name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"allPairsLength","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"tokenA","type":"address"},{"internalType":"address","name":"tokenB","type":"address"}],"name":"createPair","outputs":[{"internalType":"address","name":"pair","type":"address"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"feeTo","outputs":[{"internalType":"address","name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"feeToSetter","outputs":[{"internalType":"address","name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[{"internalType":"address","name":"","type":"address"},{"internalType":"address","name":"","type":"address"}],"name":"getPair","outputs":[{"internalType":"address","name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"_feeTo","type":"address"}],"name":"setFeeTo","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"internalType":"address","name":"_feeToSetter","type":"address"}],"name":"setFeeToSetter","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"}]; // Add Uniswap V2 Factory ABI here
const uniswapV2FactoryAddress = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'; 
const apiKey = '';

const provider = new ethers.AlchemyProvider("homestead", apiKey);

const factoryContract = new ethers.Contract(uniswapV2FactoryAddress, uniswapV2FactoryABI, provider);

let poolData = [];

async function processEvent(token0, token1, pairAddress, event) {
    token0 = token0.toLowerCase();
    token1 = token1.toLowerCase();
    pairAddress = pairAddress.toLowerCase();

    let tokens = [token0, token1].sort();
    let poolInfo = {
        address: pairAddress,
        protocol: "Uniswap V2",
        tokens: tokens,
        factory: uniswapV2FactoryAddress.toLowerCase(),
        fee: 3000, // Modify as needed
        createdInBlock: event.blockNumber,
        createdInTx: event.transactionHash.toLowerCase(),
        index: poolData.length
    };

    poolData.push(poolInfo);
}

async function fetchEventsInRange(startBlock, endBlock) {
    const events = await factoryContract.queryFilter(factoryContract.filters.PairCreated(), startBlock, endBlock);
    return events;
}

async function main() {
    const startBlock = 10000835; // the deployment block of the Uniswap V2 Factory
    let endBlock = await provider.getBlockNumber();
    const batchSize = 2000; // Set a reasonable batch size

    for (let currentBlock = startBlock; currentBlock <= endBlock; currentBlock += batchSize) {
        const batchEndBlock = Math.min(currentBlock + batchSize, endBlock);
        console.log(`Fetching events from block ${currentBlock} to ${batchEndBlock}`);

        try {
            const events = await fetchEventsInRange(currentBlock, batchEndBlock);
            for (const event of events) {
                await processEvent(event.args.token0, event.args.token1, event.address, event);
            }
        } catch (error) {
            console.error(`Error fetching events in block range ${currentBlock} to ${batchEndBlock}:`, error);
        }
    }

    fs.writeFileSync('uniswapPools.json', JSON.stringify(poolData, null, 2));
}

main().catch(console.error);