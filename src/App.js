import { BrowserRouter,Routes,Route } from "react-router-dom"

import Login from "./pages/Login"
import Dashboard from "./pages/Dashboard"
import Ledger from "./pages/Ledger"
import SalesOutstanding from "./pages/SalesOutstanding"
/*import Sales from "./pages/Sales"
import Purchase from "./pages/Purchase"
import SalesOutstanding from "./pages/SalesOutstanding"
import PurchaseOutstanding from "./pages/PurchaseOutstanding"
import MillOutstanding from "./pages/MillOutstanding"
*/
function App(){

const user=localStorage.getItem("user")

return(

<BrowserRouter basename="/sas-app">

<Routes>

<Route path="/" element={user?<Dashboard/>:<Login/>}/>
<Route path="/dashboard" element={<Dashboard/>}/>
<Route path="/ledger" element={<Ledger/>}/>
<Route path="/sales-outstanding" element={<SalesOutstanding/>}/>
{/* <Route path="/sales" element={<Sales/>}/>
<Route path="/purchase" element={<Purchase/>}/>
<Route path="/sales-outstanding" element={<SalesOutstanding/>}/>
<Route path="/purchase-outstanding" element={<PurchaseOutstanding/>}/>
<Route path="/mill-outstanding" element={<MillOutstanding/>}/>
 */}
</Routes>

</BrowserRouter>

)

}

export default App