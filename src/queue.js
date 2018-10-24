"use strict";

class Queue {
    constructor() 
    {
        this.data = [];
    }
    
    enqueue(value) {
        this.data.push(value);
    }
    
    dequeue() {
        return this.data.shift();
    }
    
    peek() {
        if (this.data.length <= 0) return null;
        
        return this.data[0];
    }
    
    last() {
        if (this.data.length <= 0) return null;
        
        return this.data[this.data.length - 1];
    }
    
    size() {
        return this.data.length;
    }
    
    clear() {
        this.data = [];
    }
}

export default Queue;