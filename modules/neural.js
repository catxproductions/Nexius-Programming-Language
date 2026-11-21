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
      const learningRate=0.01;
      const sigmoid=x=>1/(1+Math.exp(-Math.max(-60,Math.min(60,x))));
      const matrix=(rows,cols)=>Array.from({length:rows},()=>Array.from({length:cols},()=> (Math.random()*2-1)*Math.sqrt(2/Math.max(1,cols))));
      const modelFor=name=>{const m=models.get(name);if(!m)throw new Error("Neural model '"+name+"' has not been declared.");return m;};
      function forward(model,vars) {
        const activations=[model.input.entries.map(e=>{
          if(!(e.variable in vars))throw new Error("Input variable '"+e.variable+"' is not defined.");
          const n=Number(vars[e.variable]);if(!Number.isFinite(n))throw new Error("Input variable '"+e.variable+"' must be a finite number.");return n;
        })];
        let values=activations[0];
        for(let layer=0;layer<model.weights.length;layer++) {
          values=model.weights[layer].map((w,j)=>sigmoid(w.reduce((sum,v,i)=>sum+v*values[i],model.biases[layer][j])));
          activations.push(values);
        }
        const outputs=values.slice();
        model.output.entries.forEach((e,i)=>{if(!(e.variable in vars))throw new Error("Output variable " + e.variable + " must be defined before requesting network outputs.");vars[e.variable]=outputs[i];});
        model.lastInference={activations,outputs,consumed:false,observed:false};
        return outputs;
      }
      function applyFeedback(model,signal,strength) {
        if(!Number.isFinite(strength)||strength<=0||strength>10)throw new Error("Feedback strength must be greater than 0 and no greater than 10.");
        const trace=model.lastInference;
        if(!trace)throw new Error("Run neural.getoutN() before applying feedback.");
        if(trace.consumed)throw new Error("This inference has already received feedback. Run the network again first.");
        const deltas=new Array(model.weights.length);
        deltas[deltas.length-1]=trace.outputs.map(value=>signal*strength*value*(1-value));
        for(let layer=deltas.length-2;layer>=0;layer--) {
          const next=deltas[layer+1], nextWeights=model.weights[layer+1], values=trace.activations[layer+1];
          deltas[layer]=values.map((value,i)=>{
            let propagated=0;
            for(let j=0;j<next.length;j++)propagated+=next[j]*nextWeights[j][i];
            return propagated*value*(1-value);
          });
        }
        for(let layer=0;layer<model.weights.length;layer++) {
          const previous=trace.activations[layer], delta=deltas[layer];
          for(let neuron=0;neuron<model.weights[layer].length;neuron++) {
            for(let input=0;input<model.weights[layer][neuron].length;input++) {
              model.weights[layer][neuron][input]=Math.max(-8,Math.min(8,model.weights[layer][neuron][input]+learningRate*delta[neuron]*previous[input]));
            }
            model.biases[layer][neuron]=Math.max(-8,Math.min(8,model.biases[layer][neuron]+learningRate*delta[neuron]));
          }
        }
        trace.consumed=true;
        if(trace.observationRecord)trace.observationRecord.feedback=signal*strength;
        model.feedbackCount++;
      }
      return {
        declareLayer(node) {
          let m=models.get(node.model);
          if(!m){m={input:null,hidden:null,output:null,assembled:false,lastInference:null,feedbackCount:0,observations:[]};models.set(node.model,m);}
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
        run(name,vars) {
          const m=modelFor(name);
          if(!m.assembled)throw new Error("Call neural.assemble("+name+") before running it.");
          return forward(m,vars).slice();
        },
        getOutput(name,index,vars) {
          const m=modelFor(name);
          if(!m.assembled)throw new Error("Call neural.assemble("+name+") before requesting outputs.");
          if(index<1||index>m.output.entries.length)throw new Error("Output neuron out"+index+" does not exist in model '"+name+"'.");
          return forward(m,vars)[index-1];
        },
        observe(name) {
          const m=modelFor(name);
          if(!m.assembled)throw new Error("Assemble the neural model before observing it.");
          if(!m.lastInference)throw new Error("Run neural.getoutN() before neural.observe().");
          const trace=m.lastInference;
          if(!trace.observed) {
            trace.observed=true;
            const record={activations:trace.activations.map(layer=>layer.slice()),outputs:trace.outputs.slice(),feedback:null};
            m.observations.push(record);
            if(m.observations.length>128)m.observations.shift();
            trace.observationRecord=record;
          }
        },
        reward(name,strength=1) {
          const m=modelFor(name);
          if(!m.assembled)throw new Error("Assemble the neural model before rewarding it.");
          applyFeedback(m,1,strength);
        },
        correct(name,strength=1) {
          const m=modelFor(name);
          if(!m.assembled)throw new Error("Assemble the neural model before correcting it.");
          applyFeedback(m,-1,strength);
        }
      };
    }
  };
  window.NexiusModules=window.NexiusModules||Object.create(null);
  window.NexiusModules.neural=neural;
})();
