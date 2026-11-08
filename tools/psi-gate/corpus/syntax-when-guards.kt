fun f(x:Any)=when(x){is String if x.length>0 -> 1;in 1..3 -> 2;!in 4..5 -> 3;0,6 -> 4;else -> 5}
