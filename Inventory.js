import React, { useState, useEffect, useRef } from "react";
import {
  collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, where, Timestamp,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { CSVLink } from "react-csv";
import Papa from "papaparse";
import "./App.css";

function Inventory() {
  const [activeTab, setActiveTab] = useState("products");
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [productForm, setProductForm] = useState({
    name: "",
    buyingPrice: "",
    sellingPrice: "",
    quantity: "",
  });
  const [saleForm, setSaleForm] = useState({
    productId: "",
    productName: "",
    quantity: "",
    sellingPrice: "",
  });
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [reportType, setReportType] = useState("daily");
  const [csvData, setCsvData] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      const productsQuery = query(collection(db, "products"), where("userId", "==", auth.currentUser.uid));
      const salesQuery = query(collection(db, "sales"), where("userId", "==", auth.currentUser.uid));
      
      const [productsSnapshot, salesSnapshot] = await Promise.all([
        getDocs(productsQuery),
        getDocs(salesQuery)
      ]);
      
      setProducts(productsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setSales(salesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    };
    fetchData();
  }, []);

  const handleProductSubmit = async (e) => {
    e.preventDefault();
    const { name, buyingPrice, sellingPrice, quantity } = productForm;

    const payload = {
      name,
      buyingPrice: parseFloat(buyingPrice),
      sellingPrice: parseFloat(sellingPrice),
      quantity: parseInt(quantity),
      remaining: parseInt(quantity),
      date: Timestamp.now(),
      userId: auth.currentUser.uid,
    };

    if (editingId) {
      await updateDoc(doc(db, "products", editingId), payload);
      setProducts(prev => prev.map(p => p.id === editingId ? { ...payload, id: editingId } : p));
      setEditingId(null);
    } else {
      const docRef = await addDoc(collection(db, "products"), payload);
      setProducts(prev => [...prev, { ...payload, id: docRef.id }]);
    }

    setProductForm({ name: "", buyingPrice: "", sellingPrice: "", quantity: "" });
  };

  const handleSaleSubmit = async (e) => {
    e.preventDefault();
    const { productId, productName, quantity, sellingPrice } = saleForm;
    
    // Find the product to update its quantity
    const product = products.find(p => p.id === productId);
    if (!product) return;

    if (parseInt(quantity) > product.remaining) {
      alert("Not enough stock available");
      return;
    }

    const salePayload = {
      productId,
      productName,
      quantity: parseInt(quantity),
      sellingPrice: parseFloat(sellingPrice),
      total: parseFloat(sellingPrice) * parseInt(quantity),
      profit: (parseFloat(sellingPrice) - product.buyingPrice) * parseInt(quantity),
      date: Timestamp.now(),
      userId: auth.currentUser.uid,
    };

    // Add sale record
    const saleRef = await addDoc(collection(db, "sales"), salePayload);
    setSales(prev => [...prev, { ...salePayload, id: saleRef.id }]);

    // Update product quantity
    const updatedProduct = {
      ...product,
      remaining: product.remaining - parseInt(quantity),
      sold: (product.sold || 0) + parseInt(quantity)
    };
    
    await updateDoc(doc(db, "products", productId), updatedProduct);
    setProducts(prev => prev.map(p => p.id === productId ? updatedProduct : p));

    setSaleForm({ productId: "", productName: "", quantity: "", sellingPrice: "" });
  };

  const startEditing = (product) => {
    setProductForm({
      name: product.name || "",
      buyingPrice: product.buyingPrice?.toString() || "",
      sellingPrice: product.sellingPrice?.toString() || "",
      quantity: product.quantity?.toString() || "",
    });
    setEditingId(product.id);
  };

  const deleteProduct = async (id) => {
    await deleteDoc(doc(db, "products", id));
    setProducts(products.filter(p => p.id !== id));
  };

  const handleCSVImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      complete: async (results) => {
        const batch = [];
        for (const row of results.data) {
          if (row.name && row.buyingPrice && row.sellingPrice && row.quantity) {
            batch.push({
              name: row.name,
              buyingPrice: parseFloat(row.buyingPrice),
              sellingPrice: parseFloat(row.sellingPrice),
              quantity: parseInt(row.quantity),
              remaining: parseInt(row.quantity),
              date: Timestamp.now(),
              userId: auth.currentUser.uid,
            });
          }
        }
        
        // Add all products in batch
        const promises = batch.map(product => addDoc(collection(db, "products"), product));
        const newDocs = await Promise.all(promises);
        const newProducts = newDocs.map((doc, i) => ({ id: doc.id, ...batch[i] }));
        setProducts(prev => [...prev, ...newProducts]);
      }
    });
  };

  const generateReport = () => {
    let filteredData = [];
    const now = new Date();
    
    if (activeTab === "products") {
      filteredData = [...products];
    } else {
      filteredData = [...sales];
    }

    if (reportType === "daily") {
      filteredData = filteredData.filter(item => {
        const itemDate = new Date(item.date.seconds * 1000);
        return itemDate.toDateString() === now.toDateString();
      });
    } else if (reportType === "weekly") {
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      filteredData = filteredData.filter(item => {
        const itemDate = new Date(item.date.seconds * 1000);
        return itemDate >= oneWeekAgo;
      });
    } else if (reportType === "monthly") {
      const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      filteredData = filteredData.filter(item => {
        const itemDate = new Date(item.date.seconds * 1000);
        return itemDate >= oneMonthAgo;
      });
    }

    setCsvData(filteredData);
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) &&
    (!dateFilter || new Date(p.date.seconds * 1000).toISOString().slice(0, 10) === dateFilter)
  );

  const filteredSales = sales.filter(s => 
    s.productName.toLowerCase().includes(search.toLowerCase()) &&
    (!dateFilter || new Date(s.date.seconds * 1000).toISOString().slice(0, 10) === dateFilter)
  );

  const totalProfit = filteredSales.reduce((acc, s) => acc + (s.profit || 0), 0);
  const totalItemsSold = filteredSales.reduce((acc, s) => acc + (s.quantity || 0), 0);
  const stockValue = filteredProducts.reduce(
    (acc, p) => acc + (p.remaining || 0) * (p.buyingPrice || 0),
    0
  );

  return (
    <div className="inventory-container">
      <div className="tab-container">
        <button 
          className={`tab-button ${activeTab === "products" ? "active" : ""}`}
          onClick={() => setActiveTab("products")}
        >
          Products
        </button>
        <button 
          className={`tab-button ${activeTab === "sales" ? "active" : ""}`}
          onClick={() => setActiveTab("sales")}
        >
          Sales
        </button>
      </div>

      <div className="card">
        {activeTab === "products" ? (
          <>
            <h3>{editingId ? "Edit Product" : "Add Product"}</h3>
            <form onSubmit={handleProductSubmit} className="inventory-form">
              <input
                value={productForm.name}
                onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                placeholder="Product Name"
                type="text"
                required
              />
              <input
                value={productForm.buyingPrice}
                onChange={(e) => setProductForm({ ...productForm, buyingPrice: e.target.value })}
                placeholder="Buying Price"
                type="number"
                min="0"
                step="0.01"
                required
              />
              <input
                value={productForm.sellingPrice}
                onChange={(e) => setProductForm({ ...productForm, sellingPrice: e.target.value })}
                placeholder="Selling Price"
                type="number"
                min="0"
                step="0.01"
                required
              />
              <input
                value={productForm.quantity}
                onChange={(e) => setProductForm({ ...productForm, quantity: e.target.value })}
                placeholder="Quantity"
                type="number"
                min="0"
                required
              />
              <button type="submit">{editingId ? "Update" : "Add"} Product</button>
            </form>
          </>
        ) : (
          <>
            <h3>Record Sale</h3>
            <form onSubmit={handleSaleSubmit} className="inventory-form">
              <select
                value={saleForm.productId}
                onChange={(e) => {
                  const product = products.find(p => p.id === e.target.value);
                  setSaleForm({
                    ...saleForm,
                    productId: e.target.value,
                    productName: product?.name || "",
                    sellingPrice: product?.sellingPrice?.toString() || ""
                  });
                }}
                required
              >
                <option value="">Select Product</option>
                {products.filter(p => p.remaining > 0).map(product => (
                  <option key={product.id} value={product.id}>{product.name}</option>
                ))}
              </select>
              <input
                value={saleForm.quantity}
                onChange={(e) => setSaleForm({ ...saleForm, quantity: e.target.value })}
                placeholder="Quantity"
                type="number"
                min="1"
                required
              />
              <input
                value={saleForm.sellingPrice}
                onChange={(e) => setSaleForm({ ...saleForm, sellingPrice: e.target.value })}
                placeholder="Selling Price"
                type="number"
                min="0"
                step="0.01"
                required
              />
              <button type="submit">Record Sale</button>
            </form>
          </>
        )}
      </div>

      <div className="csv-import-export">
        <button onClick={() => fileInputRef.current.click()}>
          Import CSV
        </button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleCSVImport}
          accept=".csv"
          style={{ display: 'none' }}
        />
        {csvData ? (
          <CSVLink 
            data={csvData} 
            filename={`${activeTab}_${reportType}_report_${new Date().toISOString().slice(0, 10)}.csv`}
          >
            Export CSV
          </CSVLink>
        ) : (
          <button onClick={generateReport}>Generate Report</button>
        )}
      </div>

      <div className="report-options">
        <button onClick={() => setReportType("daily")} className={reportType === "daily" ? "active" : ""}>
          Daily
        </button>
        <button onClick={() => setReportType("weekly")} className={reportType === "weekly" ? "active" : ""}>
          Weekly
        </button>
        <button onClick={() => setReportType("monthly")} className={reportType === "monthly" ? "active" : ""}>
          Monthly
        </button>
      </div>

      <div className="search-filter">
        <input
          type="text"
          placeholder={`Search by ${activeTab === "products" ? "product name" : "product or sale"}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
        />
      </div>

      <div className="summary">
        <p>Total Profit: ${totalProfit.toFixed(2)}</p>
        <p>Total Items Sold: {totalItemsSold}</p>
        <p>Stock Value: ${stockValue.toFixed(2)}</p>
      </div>

      {activeTab === "products" ? (
        <div className="product-list">
          <div className="inventory-header">
            <div>Name</div>
            <div>Buy Price</div>
            <div>Sell Price</div>
            <div>In Stock</div>
            <div>Sold</div>
            <div>Actions</div>
          </div>
          {filteredProducts.map(product => (
            <div key={product.id} className="product-card">
              <div>{product.name}</div>
              <div>${product.buyingPrice?.toFixed(2)}</div>
              <div>${product.sellingPrice?.toFixed(2)}</div>
              <div>{product.remaining}</div>
              <div>{product.sold || 0}</div>
              <div>
                <button className="edit-btn" onClick={() => startEditing(product)}>
                  Edit
                </button>
                <button className="delete-btn" onClick={() => deleteProduct(product.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="sales-list">
          <div className="inventory-header">
            <div>Product</div>
            <div>Quantity</div>
            <div>Unit Price</div>
            <div>Total</div>
            <div>Profit</div>
            <div>Date</div>
          </div>
          {filteredSales.map(sale => (
            <div key={sale.id} className="product-card">
              <div>{sale.productName}</div>
              <div>{sale.quantity}</div>
              <div>${sale.sellingPrice?.toFixed(2)}</div>
              <div>${sale.total?.toFixed(2)}</div>
              <div>${sale.profit?.toFixed(2)}</div>
              <div>{new Date(sale.date.seconds * 1000).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Inventory;