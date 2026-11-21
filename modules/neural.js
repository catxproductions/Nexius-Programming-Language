/* Nexius optional Neural module: syntax extension and feed-forward runtime. */
(() => {
  "use strict";
  const neural = {
    name: "neural",
    parseLayerHeader(text) {
      const m = text.match(/^neural\.([A-Za-z_][A-Za-z0-9_]*)\.(inputLayer|hidden|outputLayer)\s+--\s*\((\d+)\)\s*:\s*$/i);
      if (!m) return null;
      const amount = Number(m[3]);
      if (!Number.isInteger(amount) || amount < 1 || amount > 512) throw new Error("Neural layer counts must be between 1 and 512.");
      return { model:m[1], layer:m[2].toLowerCase(), amount };
    },
    parseLayerEntry(text, layer) {
      let m;
      if (layer === "inputlayer") {
        m=text.match(/^neural\.in(\d+)\s*=\s*([A-Za-z_][A-Za-z0-9_]*)$/i);
        return m ? {kind:"input",index:Number(m[1]),variable:m[2]} : null;
      }
      if (layer === "outputlayer") {
        m=text.match(/^neural\.out(\d+)\s*=\s*([A-Za-z_][A-Za-z0-9_]*)$/i);
        return m ? {kind:"output",index:Number(m[1]),variable:m[2]} : null;
      }
      m=text.match(/^neural\.HL(\d+)\s*\(\s*(\d+)\s*\)$/i);
      if (!m) return null;
      const neurons = Number(m[2]);
      if (!Number.isInteger(neurons) || neurons < 1 || neurons > 512) throw new Error("Each hidden layer must contain between 1 and 512 neurons.");
      return {kind:"hidden",index:Number(m[1]),neurons};
    },
    createRuntime() {
      const models=new Map();
      const sigmoid=x=>1/(1+Math.exp(-Math.max(-60,Math.min(60,x))));
      const matrix=(rows,cols)=>Array.from({length:rows},()=>Array.from({length:cols},()=> (Math.random()*2-1)*Math.sqrt(2/Math.max(1,cols))));
      const modelFor=name=>{const m=models.get(name);if(!m)throw new Error("Neural model '"+name+"' has not been declared.");return m;};
      function forward(model,vars) {
        let values=model.input.entries.map(e=>{
          if(!(e.variable in vars))throw new Error("Input variable '"+e.variable+"' is not defined.");
          const n=Number(vars[e.variable]);if(!Number.isFinite(n))throw new Error("Input variable '"+e.variable+"' must be a finite number.");return n;
        });
        for(let layer=0;layer<model.hidden.length;layer++)
          values=model.weights[layer].map((w,j)=>sigmoid(w.reduce((sum,v,i)=>sum+v*values[i],model.biases[layer][j])));
        const last=model.weights.length-1;
        const outputs=model.weights[last].map((w,j)=>sigmoid(w.reduce((sum,v,i)=>sum+v*values[i],model.biases[last][j])));
        model.output.entries.forEach((e,i)=>{if(!(e.variable in vars))throw new Error("Output variable " + e.variable + " must be defined before requesting network outputs.");vars[e.variable]=outputs[i];});
        return outputs;
      }
      return {
        declareLayer(node) {
          let m=models.get(node.model);
          if(!m){m={input:null,hidden:null,output:null,assembled:false};models.set(node.model,m);}
          if(m.assembled)throw new Error("Model '"+node.model+"' is already assembled.");
          const key=node.layer==="inputlayer"?"input":node.layer==="outputlayer"?"output":"hidden";
          if(m[key]!==null)throw new Error("Model '"+node.model+"' already has a "+key+" declaration.");
          if(key==="hidden")m.hidden=node.entries.map(e=>e.neurons);else m[key]={entries:node.entries};
        },
        assemble(name) {
          const m=modelFor(name);
          if(!m.input)throw new Error("Model '"+name+"' is missing inputLayer.");
          if(!m.hidden||!m.hidden.length)throw new Error("Model '"+name+"' needs at least one hidden layer.");
          if(!m.output)throw new Error("Model '"+name+"' is missing outputLayer.");
          const sizes=[m.input.entries.length,...m.hidden,m.output.entries.length];
          const parameterCount=sizes.slice(1).reduce((total,size,index)=>total+size*sizes[index]+size,0);
          if(parameterCount>1000000)throw new Error("This network exceeds the one-million-parameter safety limit.");
          m.weights=[];m.biases=[];
          for(let i=1;i<sizes.length;i++){m.weights.push(matrix(sizes[i],sizes[i-1]));m.biases.push(Array.from({length:sizes[i]},()=> (Math.random()*2-1)*0.1));}
          m.assembled=true;return sizes;
        },
        getOutput(name,index,vars) {
          const m=modelFor(name);
          if(!m.assembled)throw new Error("Call neural.assemble("+name+") before requesting outputs.");
          if(index<1||index>m.output.entries.length)throw new Error("Output neuron out"+index+" does not exist in model '"+name+"'.");
          return forward(m,vars)[index-1];
        }
      };
    }
  };
  window.NexiusModules=window.NexiusModules||Object.create(null);
  window.NexiusModules.neural=neural;
})();